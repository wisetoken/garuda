import { and, or, eq, gt, gte, lte } from "@arkiv-network/sdk/query";
import { addr, u64, u256 } from "@arkiv-network/sdk/schema";
import { isAddress } from "viem";
import { SalesError, type SalesDeployment } from "../../src/lib/blend/sales";
import { arkivScope } from "./arkiv-schema";

export type ArkivFilters = {
  maker?: string; tokenId?: string; before?: string; kind?: "listing" | "bid";
  participant?: string; currency?: string; stakeOwner?: string; stakeType?: "signature" | "advanced";
  minPrice?: string; maxPrice?: string; minPrincipal?: string; minShares?: string;
  maturesAfter?: string; maturesBefore?: string;
  sort?: "price" | "principal" | "shares" | "maturesAt" | "stakeStartAt" | "publishedAt" | "expires";
  direction?: "asc" | "desc";
};
const sorts = ["price", "principal", "shares", "maturesAt", "stakeStartAt", "publishedAt", "expires"];
export function parseArkivFilters(input: Record<string, string | undefined>): ArkivFilters {
  const f: Record<string, string> = {};
  const fail = () => { throw new SalesError("invalid-filter", "Invalid Arkiv market filter."); };
  for (const name of ["maker", "stakeOwner", "currency", "participant"]) {
    const value = input[name]; if (value === undefined) continue;
    if (!isAddress(value, { strict: false })) fail(); f[name] = value.toLowerCase();
  }
  for (const name of ["tokenId", "minPrice", "maxPrice", "minPrincipal", "minShares", "maturesAfter", "maturesBefore"]) {
    const value = input[name]; if (value === undefined) continue;
    if (!/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= 2n ** (name.startsWith("matures") ? 64n : 256n)) fail();
    f[name] = value;
  }
  for (const [low, high] of [["minPrice", "maxPrice"], ["maturesAfter", "maturesBefore"]])
    if (f[low] && f[high] && BigInt(f[low]) > BigInt(f[high])) fail();
  for (const [name, allowed] of Object.entries({ kind: ["listing", "bid"], stakeType: ["signature", "advanced"], sort: sorts, direction: ["asc", "desc"] })) {
    if (input[name] === undefined) continue;
    if (!allowed.includes(input[name]!)) fail(); f[name] = input[name]!;
  }
  if (input.before !== undefined) {
    if (!/^(v1:)?(0|[1-9][0-9]{0,4})$/.test(input.before) || Number(input.before.replace("v1:", "")) > 10000)
      throw new SalesError("invalid-filter", "Invalid Arkiv page.");
    f.before = input.before;
  }
  return f as ArkivFilters;
}
export function orderFilters(deployment: SalesDeployment, f: ArkivFilters) {
  return and(eq("scope", arkivScope(deployment)), eq("chainId", u64(1n)), eq("collection", addr(deployment.collection)),
    gt("expires", u64(BigInt(Math.floor(Date.now()/1000)))),
    ...(f.maker ? [eq("maker", addr(f.maker))] : []), ...(f.stakeOwner ? [eq("stakeOwner", addr(f.stakeOwner))] : []),
    ...(f.participant ? [or(eq("maker", addr(f.participant)), eq("stakeOwner", addr(f.participant)))] : []),
    ...(f.currency ? [eq("currency", addr(f.currency))] : []), ...(f.kind ? [eq("kind", f.kind)] : []),
    ...(f.stakeType ? [eq("stakeType", f.stakeType)] : []), ...(f.tokenId ? [eq("tokenId", u256(BigInt(f.tokenId)))] : []),
    ...(f.minPrice ? [gte("price", u256(BigInt(f.minPrice)))] : []), ...(f.maxPrice ? [lte("price", u256(BigInt(f.maxPrice)))] : []),
    ...(f.minPrincipal ? [gte("principal", u256(BigInt(f.minPrincipal)))] : []), ...(f.minShares ? [gte("shares", u256(BigInt(f.minShares)))] : []),
    ...(f.maturesAfter ? [gte("maturesAt", u64(BigInt(f.maturesAfter)))] : []), ...(f.maturesBefore ? [lte("maturesAt", u64(BigInt(f.maturesBefore)))] : []));
}
// Legacy entities do not contain these indexed fields; do not pretend they match a range query.
export function includeLegacy(f: ArkivFilters) {
  return ![f.participant, f.currency, f.stakeOwner, f.stakeType, f.minPrice, f.maxPrice, f.minPrincipal, f.minShares, f.maturesAfter, f.maturesBefore].some(v => v !== undefined);
}
