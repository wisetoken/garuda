import { isAddress, parseEther } from "viem";
import type { MarketFilters } from "./presentation";
export type MarketRangeFilters = { minPrice?: string; maxPrice?: string; maturesFrom?: string; maturesTo?: string };
export type MarketQueryFilters = { tokenId?: string; participant?: string; stakeOwner?: string; stakeType?: string;
  minPrice?: string; maxPrice?: string; maturesAfter?: string; maturesBefore?: string };
const maxUint256 = (1n << 256n) - 1n;
export function priceUnits(value?: string): bigint | undefined {
  if (!value?.trim()) return undefined;
  if (!/^\d+(\.\d{1,18})?$/.test(value)) throw new Error("Use a valid WISE amount.");
  const amount = parseEther(value);
  if (amount > maxUint256) throw new Error("Amount is too large.");
  return amount;
}
export function dateSeconds(value?: string, endOfDay = false) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid date.");
  const millis = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(millis) || millis < 0 || new Date(millis).toISOString().slice(0,10) !== value) throw new Error("Choose a valid date.");
  return millis / 1000 + (endOfDay ? 86399 : 0);
}
export function rangeError(filters: MarketRangeFilters) {
  try {
    const low = priceUnits(filters.minPrice), high = priceUnits(filters.maxPrice);
    if (low !== undefined && high !== undefined && low > high) return "Minimum price must not exceed maximum price.";
    const from = dateSeconds(filters.maturesFrom), to = dateSeconds(filters.maturesTo, true);
    if (from !== undefined && to !== undefined && from > to) return "Choose an end date after the start date.";
  } catch (error) { return (error as Error).message; }
  return "";
}
export function exactStakeSearch(search: string) {
  const value = search.trim();
  const match = /^(?:(signature|advanced)(?:\s+stake)?\s+)?#?(\d+)$/i.exec(value);
  if (!match || match[2].length > 78 || BigInt(match[2]) > maxUint256) return undefined;
  return { tokenId: String(BigInt(match[2])), ...(match[1] ? { stakeType: match[1].toLowerCase() } : {}) };
}
export function arkivQueryFilters(filters: MarketFilters): MarketQueryFilters {
  if (rangeError(filters)) return {};
  const query: MarketQueryFilters = { ...exactStakeSearch(filters.search) };
  if (isAddress(filters.search.trim(), { strict: false })) query.participant = filters.search.trim().toLowerCase();
  if (filters.collections.length === 1) query.stakeType = filters.collections[0];
  const min = priceUnits(filters.minPrice), max = priceUnits(filters.maxPrice);
  const from = dateSeconds(filters.maturesFrom), to = dateSeconds(filters.maturesTo, true);
  if (min !== undefined) query.minPrice = String(min);
  if (max !== undefined) query.maxPrice = String(max);
  if (from !== undefined) query.maturesAfter = String(from);
  if (to !== undefined) query.maturesBefore = String(to);
  return query;
}
