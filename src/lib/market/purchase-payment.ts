import { decodeEventLog, getAddress, keccak256, parseAbi, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { advancedSale, seaportStructs } from "../blend/seaport";
import { guard, send, assertSaleReceipt, type SalesSession } from "../blend/sales-wallet";
import { verifySalesDeployment, verifySignedSale } from "../blend/sales-chain";
import { sameAddress, tokenSalesAbi, type SalesDeployment, type SignedSale } from "../blend/sales";
import { FUNDING_ROUTER, FUNDING_WETH, fundingPath, fundingRouterAbi } from "../blend/wise-funding";
import { purchaseFundingTokens } from "./purchase-funding";
export const purchaseRouterAbi = parseAbi([
  ...seaportStructs,
  "function buy(AdvancedOrder,address,uint256,uint256) payable returns(uint256)",
  ...["ZONE", "COLLECTION", "WISE", "SEAPORT", "UNISWAP"].map(name => `function ${name}() view returns(address)`),
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
  const values = await Promise.all(["ZONE","COLLECTION","WISE","SEAPORT","UNISWAP","ZONE_CODE_HASH"].map(functionName => client.readContract({address:r.address,abi:purchaseRouterAbi,functionName})));
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
    if (!s.validateSale) throw new Error("Fresh order validation is required.");
    await s.validateSale(signed);
    const block = await verifySalesDeployment(s.client,s.deployment);
    const verified = await verifySignedSale(s.client,s.deployment,signed,block);
    if (verified.status !== "available" || verified.order.kind !== 0 || sameAddress(verified.order.owner,s.address)) throw new Error("This listing is unavailable.");
    validatePurchasePayment(q,s.deployment,s.address,verified.hash,verified.order.currency,verified.order.amount);
    await verifyPurchaseRouter(s.client,s.deployment);
    return verified;
  };
  s.onStep?.("checking");
  await review();
  const native = sameAddress(q.inputToken,zeroAddress);
  const balance = native ? await s.client.getBalance({address:s.address}) : await s.client.readContract({address:q.inputToken,abi:tokenSalesAbi,functionName:"balanceOf",args:[s.address]});
  if (balance < q.maxInput) throw new Error("Insufficient payment balance. Keep ETH for gas as well.");
  if (!native) {
    const allowance = await s.client.readContract({address:q.inputToken,abi:tokenSalesAbi,functionName:"allowance",args:[s.address,q.router]});
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
  const paid = receipt.logs.some(log => {
    if (!sameAddress(log.address,q.router)) return false;
    try {
      const event = decodeEventLog({abi:purchaseRouterAbi,data:log.data,topics:log.topics});
      if (event.eventName !== "StakePurchased") return false;
      const e=event.args;
      return e.orderHash===hash && sameAddress(e.buyer,s.address) && e.tokenId===order.tokenId && sameAddress(e.inputToken,q.inputToken) &&
        e.inputAmount>0n && e.inputAmount<=q.maxInput && sameAddress(e.currency,order.currency) && e.amount===order.amount;
    } catch { return false; }
  });
  if (!paid) throw new Error("Purchase receipt did not match. Check the transaction before retrying.");
  return {receipt,hash,order};
}
