import type { Hex } from "viem";
import type { SignaturePosition } from "../blend/live-portfolio";
import type { SaleRow, SignedSale } from "../blend/sales";
export type MarketIntent =
  | { kind: "list"; position: SignaturePosition }
  | { kind: "bid"; position: SignaturePosition }
  | { kind: "fill"; row: SaleRow }
  | { kind: "cancel"; row: SignedSale };
export type PendingTx = { hash: Hex; kind: string; confirmed: boolean };
