import { decodeEventLog, getAddress, keccak256, parseAbi, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { advancedSale, seaportStructs } from "../blend/seaport";
import { guard, send, paymentAllowance, assertSaleReceipt, type SalesSession } from "../blend/sales-wallet";
import { parseSignedSale, sameAddress, tokenSalesAbi, type SalesDeployment, type SignedSale } from "../blend/sales";
import { FUNDING_ROUTER, FUNDING_WETH, fundingPath, fundingRouterAbi } from "../blend/wise-funding";
import { purchaseFundingTokens } from "./purchase-funding";
export const purchaseRouterAbi = parseAbi([
  ...seaportStructs,
  "function buy(AdvancedOrder,address,uint256,uint256) payable returns(uint256)",
  "function ZONE() view returns(address)",
  "function COLLECTION() view returns(address)",
  "function WISE() view returns(address)",
  "function SEAPORT() view returns(address)",
  "function UNISWAP() view returns(address)",
  "function ZONE_CODE_HASH() view returns(bytes32)",
  "event StakePurchased(bytes32 indexed orderHash,address indexed buyer,uint256 indexed tokenId,address inputToken,uint256 inputAmount,address currency,uint256 amount)",
]);
export type PurchasePaymentQuote = {
  buyer: Address; orderHash: Hex; currency: Address; amount: bigint; inputToken: Address;
  estimatedInput: bigint; maxInput: bigint; slippage: number; expires: number; router: Address; routerCodeHash: Hex; chainId: number;
};
export type PaymentReviewState = {quote?: PurchasePaymentQuote; loading?: boolean; insufficient?: boolean; unknownBalance?: boolean; expired?: boolean};
export function maximumPaymentInput(amount: bigint, bps: number) {
  if (amount <= 0n || !Number.isInteger(bps) || bps < 10 || bps > 300) throw new Error("Invalid payment quote or slippage.");
  return (amount * BigInt(10000 + bps) + 9999n) / 10000n;
}
export async function verifyPurchaseRouter(client: PublicClient, d: SalesDeployment) {
  const r = d.purchaseRouter;
  if (!r || d.paymentSchemaVersion !== 2) throw new Error("Alternate payment is unavailable for this listing.");
  if (await client.getChainId() !== d.chainId) throw new Error("Payment network changed.");
  const code = await client.getCode({address:r.address});
  if (!code || keccak256(code) !== r.codeHash) throw new Error("Payment router code changed.");
  const values = await Promise.all((["ZONE","COLLECTION","WISE","SEAPORT","UNISWAP","ZONE_CODE_HASH"] as const).map(functionName => client.readContract({address:r.address,abi:purchaseRouterAbi,functionName})));
  const expected = [d.adapter,d.collection,d.currency,d.market,FUNDING_ROUTER,d.adapterCodeHash];
  if (values.some((v,i) => typeof v !== "string" || v.toLowerCase() !== expected[i].toLowerCase())) throw new Error("Payment router configuration changed.");
  return r;
}
export async function quotePurchasePayment(client: PublicClient, d: SalesDeployment, input: {buyer: Address; orderHash: Hex; currency: Address; amount: bigint; inputToken: Address; slippage: number}): Promise<PurchasePaymentQuote> {
  const router = await verifyPurchaseRouter(client,d);
  if (!purchaseFundingTokens.some(t=>sameAddress(t.address,input.inputToken))) throw new Error("Unsupported payment token.");
  const path = fundingPath(input.inputToken,input.currency), block = await client.getBlock();
  if (input.amount <= 0n) throw new Error("Invalid purchase amount.");
  const estimatedInput = path.length === 1 ? input.amount : (await client.readContract({address:FUNDING_ROUTER,abi:fundingRouterAbi,functionName:"getAmountsIn",args:[input.amount,path],blockNumber:block.number!}))[0];
  const maxInput = path.length === 1 ? input.amount : maximumPaymentInput(estimatedInput,input.slippage);
  return {...input,estimatedInput,maxInput,expires:Number(block.timestamp)*1000+120_000,router:router.address,routerCodeHash:router.codeHash,chainId:d.chainId};
}
export function validatePurchasePayment(q: PurchasePaymentQuote, d: SalesDeployment, buyer: Address, orderHash: Hex, currency: Address, amount: bigint) {
  const wrap = getAddress(q.inputToken) === zeroAddress && getAddress(currency) === FUNDING_WETH;
  if (!d.purchaseRouter || !sameAddress(q.router,d.purchaseRouter.address) || q.routerCodeHash !== d.purchaseRouter.codeHash || q.chainId !== d.chainId ||
      !sameAddress(q.buyer,buyer) || q.orderHash !== orderHash || !sameAddress(q.currency,currency) || q.amount !== amount || Date.now() >= q.expires ||
      q.maxInput !== (wrap ? amount : maximumPaymentInput(q.estimatedInput,q.slippage)) || q.estimatedInput <= 0n ||
      !purchaseFundingTokens.some(t=>sameAddress(t.address,q.inputToken))) throw new Error("Payment quote changed or expired. Refresh it.");
  fundingPath(q.inputToken,currency);
}
export async function buyWithPayment(s: SalesSession, signed: SignedSale, q: PurchasePaymentQuote) {
  const review = async () => {
    await guard(s);
    const verified = parseSignedSale(signed,s.deployment);
    if (verified.order.kind !== 0 || sameAddress(verified.order.owner,s.address)) throw new Error("This listing is unavailable.");
    validatePurchasePayment(q,s.deployment,s.address,verified.hash,verified.order.currency,verified.order.amount);
    // The router was verified when this expiring quote was loaded in the review.
    return verified;
  };
  s.onStep?.("checking");
  await review();
  const native = sameAddress(q.inputToken,zeroAddress);
  if (!native) {
    const allowance = await paymentAllowance(s,q.inputToken,q.router);
    if (allowance < q.maxInput) {
      s.onStep?.("approving-funding");
      if (allowance > 0n) await send(s,{address:q.inputToken,abi:tokenSalesAbi,functionName:"approve",args:[q.router,0n]},"Reset payment approval");
      await send(s,{address:q.inputToken,abi:tokenSalesAbi,functionName:"approve",args:[q.router,q.maxInput]},"Payment approval");
    }
  }
  const {order,hash} = await review();
  s.onStep?.("settling");
  const receipt = await send(s,{address:q.router,abi:purchaseRouterAbi,functionName:"buy",args:[advancedSale(s.deployment,order,signed.signature),q.inputToken,q.maxInput,BigInt(Math.floor(q.expires/1000))],value:native?q.maxInput:0n},"Stake purchase");
  assertSaleReceipt(receipt,s.deployment,order,hash,q.router);
  let inputSpent: bigint | undefined;
  const paid = receipt.logs.some(log => {
    if (!sameAddress(log.address,q.router)) return false;
    try {
      const event = decodeEventLog({abi:purchaseRouterAbi,data:log.data,topics:log.topics});
      if (event.eventName !== "StakePurchased") return false;
      const e=event.args;
      const matches = e.orderHash===hash && sameAddress(e.buyer,s.address) && e.tokenId===order.tokenId && sameAddress(e.inputToken,q.inputToken) &&
        e.inputAmount>0n && e.inputAmount<=q.maxInput && sameAddress(e.currency,order.currency) && e.amount===order.amount;
      if(matches) inputSpent=e.inputAmount;
      return matches;
    } catch { return false; }
  });
  if (!paid) throw new Error("Purchase receipt did not match. Check the transaction before retrying.");
  return {receipt,hash,order,payment:{token:q.inputToken,amount:inputSpent!}};
}
