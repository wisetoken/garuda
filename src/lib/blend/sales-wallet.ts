import { ETHEREUM_CONFIRMATIONS } from "../confirmation-policy";
import { assertLegacyTradingRetired } from "./sales-migration";
import { acceptsPayment, paymentSchema, paymentToken } from "./payment-tokens";
import {
  decodeEventLog,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type TransactionReceipt,
} from "viem";
import {
  seaportTypedData,
  seaportComponents,
  saleSettlement,
  saleAmounts,
  zoneAbi,
} from "./seaport";
import {
  marketAbi,
  nftSalesAbi,
  tokenSalesAbi,
  serializeSale,
  parseSignedSale,
  SalesError,
  sameAddress,
  type SalesDeployment,
  type SignedSale,
} from "./sales";
import {
  nftApproved,
  readSaleAsset,
  verifySalesDeployment,
} from "./sales-chain";

export type SalesStep =
  | "checking"
  | "approving-nft"
  | "approving-wise"
  | "approving-funding"
  | "swapping-funding"
  | "signing"
  | "publishing"
  | "confirming"
  | "settling"
  | "cancelling";
export type SalesSession = {
  client: PublicClient;
  wallet: Pick<
    WalletClient,
    "account" | "chain" | "getChainId" | "writeContract" | "signTypedData"
  >;
  deployment: SalesDeployment;
  address: Address;
  assertWallet: () => Promise<void>;
  requireBidApproval?: boolean;
  readPaymentAllowance?: (currency: Address, spender: Address) => Promise<bigint>;
  readNftApproval?: (tokenId: bigint) => Promise<boolean>;
  prepareSignature?: (tokenId: bigint) => Promise<SaleSigningContext>;
  validateSale?: (signed: SignedSale) => Promise<void>;
  onStep?: (step: SalesStep) => void;
  onTransaction?: (hash: Hex, kind: string) => void;
  onConfirmed?: () => void;
  rememberSignature?: (signed: SignedSale) => void;
  supportsAtomic?: () => Promise<boolean>;
  sendAtomic?: (calls: SaleCall[]) => Promise<Awaited<ReturnType<PublicClient['waitForTransactionReceipt']>>>;
};
export type SaleCall = { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] };
export async function guard(s: SalesSession) {
  await s.assertWallet();
  if (
    !s.wallet.account ||
    !sameAddress(s.wallet.account.address, s.address) ||
    (await s.wallet.getChainId()) !== s.deployment.chainId
  )
    throw new SalesError(
      "wrong-wallet",
      "Use the signing wallet on the configured Ethereum network.",
    );
}
export async function send(
  s: SalesSession,
  call: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
    value?: bigint;
  },
  kind: string,
) {
  await guard(s);
  // Let the wallet estimate/simulate. Do not duplicate its work over the app RPC.
  const hash = await s.wallet.writeContract({
    ...call,
    account: s.wallet.account!,
    chain: s.wallet.chain,
  } as Parameters<WalletClient["writeContract"]>[0]);
  s.onTransaction?.(hash, kind);
  s.onStep?.("confirming");
  const receipt = await s.client.waitForTransactionReceipt({
    hash,
    confirmations: ETHEREUM_CONFIRMATIONS,
    // Keep one-confirmation UX even when recovering an older cached deployment.
    timeout: Math.max(120_000, 120_000 + ETHEREUM_CONFIRMATIONS * 30_000),
    onReplaced: ({ transaction }) => s.onTransaction?.(transaction.hash, kind),
  });
  if (receipt.status !== "success")
    throw new SalesError(
      "reverted",
      "Transaction reverted. No success has been recorded.",
    );
  s.onConfirmed?.();
  return receipt;
}

/** The guardian explicitly opens the verified market after its order book is ready. */
export async function activateSalesMarket(
  s: SalesSession,
  checkOrderBook: () => Promise<void>,
) {
  await guard(s);
  if (!sameAddress(s.address, s.deployment.guardian))
    throw new SalesError(
      "wrong-guardian",
      "Connect the marketplace guardian wallet.",
    );
  await verifySalesDeployment(s.client, s.deployment);
  await assertLegacyTradingRetired(s.client, s.deployment);
  await checkOrderBook();
  await guard(s);
  const paused = () =>
    s.client.readContract({
      address: s.deployment.adapter,
      abi: zoneAbi,
      functionName: "newActivityPaused",
    });
  if (!(await paused())) return null;
  const receipt = await send(
    s,
    {
      address: s.deployment.adapter,
      abi: zoneAbi,
      functionName: "setNewActivityPaused",
      args: [false],
    },
    "Marketplace activation",
  );
  await verifySalesDeployment(s.client, s.deployment);
  if (await paused())
    throw new SalesError("paused", "The marketplace is still paused.");
  return receipt;
}
export async function paymentAllowance(s: SalesSession, currency: Address, spender = s.deployment.market) {
  return s.readPaymentAllowance ? s.readPaymentAllowance(currency, spender) : s.client.readContract({
    address: currency, abi: tokenSalesAbi, functionName: "allowance", args: [s.address, spender],
  });
}
async function hasNftApproval(s: SalesSession, tokenId: bigint) {
  return s.readNftApproval ? s.readNftApproval(tokenId) : nftApproved(s.client, s.deployment, s.address, tokenId);
}
async function approveNFT(s: SalesSession, tokenId: bigint) {
  if (await hasNftApproval(s, tokenId)) return false;
  s.onStep?.("approving-nft");
  await send(s, {address: s.deployment.collection, abi: nftSalesAbi, functionName: "approve",
    args: [s.deployment.market, tokenId]}, "NFT approval");
  return true;
}
async function approvePayment(s: SalesSession, amount: bigint, currency: Address, allowWrite = true) {
  if (!acceptsPayment(s.deployment, currency)) throw new SalesError("terms", "Unsupported payment currency.");
  if (await paymentAllowance(s, currency) >= amount) return false;
  const symbol = paymentToken(currency).symbol;
  if (!allowWrite) throw new SalesError("approval-missing", `Approve ${symbol} before signing this bid.`);
  s.onStep?.("approving-wise");
  await send(s, {address: currency, abi: tokenSalesAbi, functionName: "approve",
    args: [s.deployment.market, amount]}, `${symbol} approval`);
  return true;
}

// These fields are needed to construct a signature, rather than to predict execution.
export async function readSaleSigningContext(client: PublicClient, d: SalesDeployment, address: Address, tokenId: bigint) {
  const block = await client.getBlock();
  if (block.number === null) throw new SalesError("chain-unavailable", "Chain data is unavailable.");
  const [asset, counter] = await Promise.all([
    readSaleAsset(client, d, tokenId, block.number),
    client.readContract({address:d.market,abi:marketAbi,functionName:"getCounter",args:[address],blockNumber:block.number}),
  ]);
  return {block, asset, counter};
}
export type SaleSigningContext = Awaited<ReturnType<typeof readSaleSigningContext>>;
/** Approval is a separate user action; it never signs or publishes an order. */
export async function approveBid(s: SalesSession, amount: bigint, currency: Address = s.deployment.currency) {
  await guard(s);
  if (amount <= 0n || amount >= (1n << 128n))
    throw new SalesError("terms", "Invalid bid amount.");
  if (!acceptsPayment(s.deployment, currency)) throw new SalesError("terms", "Unsupported payment currency.");
  // This is an explicit approval action: the review already selected the amount.
  s.onStep?.("approving-wise");
  await send(s, {address:currency,abi:tokenSalesAbi,functionName:"approve",args:[s.deployment.market,amount]}, `${paymentToken(currency).symbol} approval`);
}

export async function publishSale(
  s: SalesSession,
  input: {
    kind: 0 | 1;
    tokenId: bigint;
    amount: bigint;
    days: number;
    nonce: bigint;
    currency?: Address;
  },
  publish: (signed: SignedSale) => Promise<unknown>,
) {
  const d = s.deployment;
  const currency = input.currency ?? d.currency;
  if (!acceptsPayment(d, currency)) throw new SalesError("terms", "Unsupported payment currency.");
  s.onStep?.("checking");
  await guard(s);
  if (![1, 3, 7, 30].includes(input.days) || input.amount <= 0n || input.amount >= (1n << 128n))
    throw new SalesError("terms", "Invalid price or duration.");
  let prepared = await (s.prepareSignature?.(input.tokenId) ?? readSaleSigningContext(s.client, d, s.address, input.tokenId));
  const original = prepared.asset;
  if (
    original.locked !== 0n ||
    (input.kind === 0
      ? !sameAddress(original.owner, s.address)
      : sameAddress(original.owner, s.address))
  )
    throw new SalesError(
      "owner",
      "The selected wallet cannot create this order.",
    );
  const approved = input.kind === 0 ? await approveNFT(s, input.tokenId)
    : await approvePayment(s, input.amount, currency, !s.requireBidApproval);
  // Only an intervening wallet approval requires another signing snapshot.
  if (approved) prepared = await readSaleSigningContext(s.client, d, s.address, input.tokenId);
  const {block, asset, counter} = prepared;
  if (
    !sameAddress(asset.owner, original.owner) ||
    asset.stateHash !== original.stateHash ||
    asset.epoch !== original.epoch ||
    asset.locked !== 0n
  )
    throw new SalesError(
      "stake-changed",
      "Stake changed while approving. Review fresh terms.",
    );
  const order = {
    kind: input.kind,
    maker: getAddress(s.address),
    owner: asset.owner,
    collection: d.collection,
    currency,
    tokenId: input.tokenId,
    stakeId: asset.stakeId,
    stateHash: asset.stateHash,
    amount: input.amount,
    nonce: input.nonce,
    epoch: asset.epoch,
    deadline: block.timestamp + BigInt(input.days * 86400),
    startTime: block.timestamp,
    counter,
    feeBps: d.feeBps,
    feeRecipient: d.feeRecipient,
  };
  await guard(s);
  s.onStep?.("signing");
  const signature = await s.wallet.signTypedData({
    ...seaportTypedData(d, order),
    account: s.wallet.account!,
  });
  const signed: SignedSale = { order: serializeSale(order), signature };
  // Persist before HTTP: a failed publish response is not cryptographic cancellation.
  s.rememberSignature?.(signed);
  await guard(s);
  s.onStep?.("publishing");
  await publish(signed);
  return signed;
}
export async function fillSale(s: SalesSession, signed: SignedSale) {
  s.onStep?.("checking");
  await guard(s);
  const {order, hash} = parseSignedSale(signed, s.deployment);
  // Signed terms are checked locally; Seaport and the zone enforce current availability.
  const atomicCalls: SaleCall[] | undefined = s.sendAtomic && await s.supportsAtomic?.() ? [] : undefined;
  if (order.kind === 0) {
    if (sameAddress(s.address, order.owner))
      throw new SalesError("self-purchase", "You already own this stake.");
    if (atomicCalls) {
      const allowance = await paymentAllowance(s, order.currency);
      if (allowance < order.amount) {
        if (allowance > 0n) atomicCalls.push({address:order.currency,abi:tokenSalesAbi,functionName:'approve',args:[s.deployment.market,0n]});
        atomicCalls.push({address:order.currency,abi:tokenSalesAbi,functionName:'approve',args:[s.deployment.market,order.amount]});
      }
    } else await approvePayment(s, order.amount, order.currency);
  } else {
    if (!sameAddress(s.address, order.owner))
      throw new SalesError(
        "owner",
        "Only the stake owner can accept this purchase bid.",
      );
    if (atomicCalls) {
      if (!await hasNftApproval(s,order.tokenId)) atomicCalls.push({address:s.deployment.collection,abi:nftSalesAbi,functionName:'approve',args:[s.deployment.market,order.tokenId]});
    } else await approveNFT(s, order.tokenId);
  }
  s.onStep?.("settling");
  await guard(s);
  const receipt = atomicCalls?.length ? await s.sendAtomic!([
    ...atomicCalls, saleSettlement(s.deployment, order, signed.signature, s.address),
  ]) : await send(
    s,
    saleSettlement(s.deployment, order, signed.signature, s.address),
    "Sale settlement",
  );
  assertSaleReceipt(receipt, s.deployment, order, hash, s.address);
  return { receipt, hash, order };
}
export function assertSaleReceipt(receipt: TransactionReceipt, deployment: SalesDeployment, order: ReturnType<typeof parseSignedSale>["order"], hash: Hex, buyer: Address) {
  const event = receipt.logs
    .flatMap((log) => {
      if (!sameAddress(log.address, deployment.adapter)) return [];
      try {
        const event = decodeEventLog({
          abi: zoneAbi,
          data: log.data,
          topics: log.topics,
        });
        return event.eventName === "SaleValidated" ? [event.args] : [];
      } catch {
        return [];
      }
    })
    .find(
      (e) =>
        e.orderHash === hash &&
        (paymentSchema(deployment) === 1 ? !("currency" in e) : "currency" in e && sameAddress(e.currency, order.currency)) &&
        e.amount === order.amount &&
        e.fee === saleAmounts(order).fee &&
        e.kind === order.kind &&
        e.tokenId === order.tokenId &&
        sameAddress(e.seller, order.owner) &&
        sameAddress(e.buyer, order.kind === 0 ? buyer : order.maker),
    );
  const fulfilled = receipt.logs.some((log) => {
    if (!sameAddress(log.address, deployment.market)) return false;
    try {
      const e = decodeEventLog({
        abi: marketAbi,
        data: log.data,
        topics: log.topics,
      });
      return (
        e.eventName === "OrderFulfilled" &&
        e.args.orderHash === hash &&
        sameAddress(e.args.offerer, order.maker) &&
        sameAddress(e.args.zone, deployment.adapter)
      );
    } catch {
      return false;
    }
  });
  if (!event || !fulfilled)
    throw new SalesError(
      "unconfirmed",
      "No matching sale event was found. Check the transaction before retrying.",
    );
}
export async function cancelSale(s: SalesSession, signed: SignedSale) {
  await guard(s);
  const { order, hash } = parseSignedSale(signed, s.deployment);
  if (!sameAddress(order.maker, s.address))
    throw new SalesError(
      "owner",
      "Only the signing wallet can cancel this order.",
    );
  s.onStep?.("cancelling");
  const receipt = await send(
    s,
    {
      address: s.deployment.market,
      abi: marketAbi,
      functionName: "cancel",
      args: [[seaportComponents(s.deployment, order)]],
    },
    "Order cancellation",
  );
  if (
    !(
      await s.client.readContract({
        address: s.deployment.market,
        abi: marketAbi,
        functionName: "getOrderStatus",
        args: [hash],
      })
    )[1]
  )
    throw new SalesError("unconfirmed", "Cancellation was not confirmed.");
  return receipt;
}
export function randomSaleNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return BigInt(
    "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
  );
}
