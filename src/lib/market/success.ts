import type { fillSale } from "../blend/sales-wallet";
import { saleAmounts } from "../blend/seaport";
import { stakeCollection } from "../blend/stake-collections";
import { parseSignedSale, type SalesDeployment, type SignedSale, type SaleRow } from "../blend/sales";

export type OrderSuccess = { kind: "publication"; hash: SaleRow["hash"]; order: SignedSale["order"]; destination: string };
export function orderSuccess(signed: SignedSale, deployment: SalesDeployment, destination: string): OrderSuccess {
  const parsed = parseSignedSale(signed, deployment);
  return { kind: "publication", hash: parsed.hash, order: parsed.signed.order, destination };
}
export type Publication = NonNullable<SaleRow["arkiv"]>;
export function readPublication(raw: unknown, orderHash: string): Publication | null {
  const value = raw as { orderHash?: string; publication?: Publication | null } | null;
  if (value?.orderHash?.toLowerCase() !== orderHash.toLowerCase()) throw new Error("Publication identity mismatch.");
  const p = value.publication;
  if (p === null) return null;
  if (!p || !["queued", "publishing", "published", "retrying", "unavailable"].includes(p.state))
    throw new Error("Invalid publication state.");
  const hash = (v: unknown) => typeof v === "string" && /^0x[0-9a-f]{64}$/i.test(v);
  if ((p.entityKey !== undefined && !hash(p.entityKey)) || (p.txHash !== undefined && !hash(p.txHash)) ||
    (p.state === "published" && !hash(p.entityKey))) throw new Error("Invalid Arkiv receipt.");
  return { state:p.state, entityKey:p.state === "published" ? p.entityKey : undefined,
    txHash:p.state === "published" ? p.txHash : undefined };
}

// Only construct a transfer receipt from fillSale's confirmed, event-verified result.
export type SettlementSuccess = {
  kind: "settlement";
  hash: SaleRow["hash"];
  transactionHash: SaleRow["hash"];
  collection: string;
  tokenId: string;
  action: "purchase" | "accept-bid";
  currency: string;
  gross: bigint;
  fee: bigint;
  net: bigint;
  destination: string;
};
export type MarketSuccess = OrderSuccess | SettlementSuccess;
export function settlementSuccess(result: Awaited<ReturnType<typeof fillSale>>): SettlementSuccess {
  const { receipt, hash, order } = result;
  if (receipt.status !== "success" || !/^0x[0-9a-f]{64}$/i.test(receipt.transactionHash ?? "") ||
      !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("A confirmed settlement receipt is required.");
  const collection = stakeCollection(order.collection);
  return {
    kind: "settlement", hash, transactionHash: receipt.transactionHash,
    currency: order.currency, collection: order.collection, tokenId: String(order.tokenId),
    action: order.kind === 0 ? "purchase" : "accept-bid",
    ...saleAmounts(order),
    destination: order.kind === 0 ? "/garuda/?screen=stakes" :
      `/garuda/?screen=trade&collection=${collection.id}&view=market&book=bids`,
  };
}
