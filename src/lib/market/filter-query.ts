import { paymentToken, paymentTokens } from "../blend/payment-tokens";
import { isAddress, parseUnits } from "viem";
import type { MarketFilters } from "./presentation";
export type MarketRangeFilters = { currency?: string; minPrice?: string; maxPrice?: string; maturesFrom?: string; maturesTo?: string };
export type MarketQueryFilters = { currency?: string; tokenId?: string; participant?: string; stakeOwner?: string; stakeType?: string;
  minPrice?: string; maxPrice?: string; maturesAfter?: string; maturesBefore?: string };
const maxUint256 = (1n << 256n) - 1n;
export function priceUnits(value?: string, currency: string = paymentTokens[0].address): bigint | undefined {
  if (!value?.trim()) return undefined;
  const token = paymentToken(currency);
  if (!new RegExp(`^\\d+(\\.\\d{1,${token.decimals}})?$`).test(value)) throw new Error(`Use a valid ${token.symbol} amount.`);
  const amount = parseUnits(value, token.decimals);
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
    const low = priceUnits(filters.minPrice, filters.currency), high = priceUnits(filters.maxPrice, filters.currency);
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
  const min = priceUnits(filters.minPrice, filters.currency), max = priceUnits(filters.maxPrice, filters.currency);
  const from = dateSeconds(filters.maturesFrom), to = dateSeconds(filters.maturesTo, true);
  if (filters.currency || min !== undefined || max !== undefined) query.currency = paymentToken(filters.currency ?? paymentTokens[0].address).address;
  if (min !== undefined) query.minPrice = String(min);
  if (max !== undefined) query.maxPrice = String(max);
  if (from !== undefined) query.maturesAfter = String(from);
  if (to !== undefined) query.maturesBefore = String(to);
  return query;
}
