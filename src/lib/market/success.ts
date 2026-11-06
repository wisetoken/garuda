import { parseSignedSale, type SalesDeployment, type SignedSale, type SaleRow } from "../blend/sales";

export type OrderSuccess = { hash: SaleRow["hash"]; order: SignedSale["order"]; destination: string };
export function orderSuccess(signed: SignedSale, deployment: SalesDeployment, destination: string): OrderSuccess {
  const parsed = parseSignedSale(signed, deployment);
  return { hash: parsed.hash, order: parsed.signed.order, destination };
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
