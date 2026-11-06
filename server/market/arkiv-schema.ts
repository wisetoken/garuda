import { paymentToken } from "../../src/lib/blend/payment-tokens";
import { defineSchema, str, bytes, u64, u256, addr } from "@arkiv-network/sdk/schema";
import { hexToString, stringToBytes, keccak256 } from "viem";
import { deploymentScope, parseSignedSale, type SalesDeployment, type SaleRow } from "../../src/lib/blend/sales";
import { parseStakeSnapshot, type StakeSnapshot } from "../../src/lib/blend/stake-snapshot";
import { stakeCollection } from "../../src/lib/blend/stake-collections";

export const ORDER_SCHEMA_VERSION = 2;
export const arkivScope = (deployment: SalesDeployment) => keccak256(stringToBytes(deploymentScope(deployment)));
export const ArkivListingsV1 = defineSchema("wiseone.garuda.orders.v1", {
  scope: str().indexed(), orderHash: str().indexed(), maker: str().indexed(), owner: str().indexed(), kind: str().indexed(),
  collection: str().indexed(), tokenId: str().indexed(), format: str().indexed(),
  expires: u64().indexed(), envelope: bytes(),
});
export const ArkivListings = defineSchema("wiseone.garuda.orders.v2", {
  scope: str().indexed(), orderHash: str().indexed(), kind: str().indexed(),
  maker: addr().indexed(), stakeOwner: addr().indexed(), collection: addr().indexed(), tokenId: u256().indexed(),
  format: str().indexed(), chainId: u64().indexed(), currency: addr().indexed(),
  currencySymbol: str().indexed(), currencyDecimals: u64().indexed(), price: u256().indexed(),
  stakeType: str().indexed(), stakeId: str().indexed(), stateHash: str().indexed(),
  principal: u256().indexed(), shares: u256().indexed(), stakeStartAt: u64().indexed(), maturesAt: u64().indexed(),
  durationDays: u64().indexed(), orderStartAt: u64().indexed(), expires: u64().indexed(),
  publishedAt: u64().indexed(), indexedAt: u64().indexed(), observedAt: u64().indexed(),
  blockNumber: u64().indexed(), blockHash: str().indexed(), snapshot: bytes(), envelope: bytes(),
});
export type OrderMetadata = { snapshot: StakeSnapshot; publishedAt: number; indexedAt: number };
export function orderAttributes(row: SaleRow, deployment: SalesDeployment, metadata: OrderMetadata) {
  const o = row.order, s = metadata.snapshot;
  return {
    scope: arkivScope(deployment), orderHash: row.hash, kind: o.kind === 0 ? "listing" : "bid",
    maker: addr(o.maker), stakeOwner: addr(o.owner), collection: addr(o.collection), tokenId: u256(BigInt(o.tokenId)),
    format: "seaport-1.6", chainId: u64(1n), currency: addr(o.currency), currencySymbol: paymentToken(o.currency).symbol, currencyDecimals: u64(BigInt(paymentToken(o.currency).decimals)),
    price: u256(BigInt(o.amount)), stakeType: stakeCollection(o.collection).id, stakeId: o.stakeId, stateHash: o.stateHash,
    principal: u256(BigInt(s.principal)), shares: u256(BigInt(s.shares)), stakeStartAt: u64(BigInt(s.startAt)),
    maturesAt: u64(BigInt(s.maturesAt)), durationDays: u64(BigInt(s.displayStake.lockDays)),
    orderStartAt: u64(BigInt(o.startTime)), expires: u64(BigInt(o.deadline)), publishedAt: u64(BigInt(metadata.publishedAt)),
    indexedAt: u64(BigInt(metadata.indexedAt)), observedAt: u64(BigInt(s.observedAt)),
    blockNumber: u64(BigInt(s.blockNumber)), blockHash: s.blockHash, snapshot: stringToBytes(JSON.stringify(s)),
    envelope: stringToBytes(JSON.stringify({ order: o, signature: row.signature })),
  };
}
// Validate discovery metadata before it can become a market row. Settlement still verifies Ethereum.
type EntityFields = Record<string, unknown>;
export function parseOrderEntity(entity: EntityFields, deployment: SalesDeployment, version: 1 | 2) {
  const value = (name: string) => (entity[name] as { value?: unknown } | undefined)?.value;
  const parsed = parseSignedSale(JSON.parse(hexToString(value("envelope") as `0x${string}`)), deployment);
  const o = parsed.signed.order;
  const matches = (name: string, expected: unknown) => {
    const actual = value(name);
    return ["maker", "owner", "stakeOwner", "collection", "currency"].includes(name)
      ? typeof actual === "string" && actual.toLowerCase() === String(expected).toLowerCase() : actual === expected;
  };
  if (!matches("scope", arkivScope(deployment)) || !matches("orderHash", parsed.hash) || !matches("format", "seaport-1.6") ||
    !matches("kind", o.kind === 0 ? "listing" : "bid") || !matches("expires", BigInt(o.deadline)) ||
    !matches("maker", o.maker.toLowerCase()) || !matches("collection", o.collection.toLowerCase())) throw new Error("Order attributes mismatch.");
  let stakeSnapshot: StakeSnapshot | undefined;
  if (version === 1) {
    if (!matches("owner", o.owner.toLowerCase()) || !matches("tokenId", o.tokenId)) throw new Error("Order attributes mismatch.");
  } else {
    const snapshot = parseStakeSnapshot(JSON.parse(hexToString(value("snapshot") as `0x${string}`)), o, undefined, Infinity);
    stakeSnapshot = snapshot;
    const publishedAt = value("publishedAt"), indexedAt = value("indexedAt");
    if (typeof publishedAt !== "bigint" || typeof indexedAt !== "bigint" || publishedAt <= 0n ||
      publishedAt > indexedAt || indexedAt > BigInt(Math.floor(Date.now()/1000)+30)) throw new Error("Invalid publication time.");
    const expected = orderAttributes({ ...parsed.signed, hash: parsed.hash } as SaleRow, deployment,
      { snapshot, publishedAt: Number(publishedAt), indexedAt: Number(indexedAt) });
    for (const [name, field] of Object.entries(expected)) {
      if (name === "snapshot" || name === "envelope") continue;
      const bare = typeof field === "string" ? field : (field as { value: unknown }).value;
      if (!matches(name, bare)) throw new Error(`Order attribute mismatch: ${name}.`);
    }
  }
  return {...parsed, stakeSnapshot};
}
