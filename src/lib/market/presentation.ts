import { paymentTokens, paymentUsdValue, type PaymentPrices } from "../blend/payment-tokens";
import { formatEther } from "viem";
import { exactStakeSearch, priceUnits, dateSeconds, type MarketRangeFilters } from "./filter-query";
import type { SaleRow } from "../blend/sales";
import type { SignaturePosition } from "../blend/live-portfolio";
import { stakeCollection } from "../blend/stake-collections";
import { stakeTimeline, stakeYield } from "../blend/stake-art";

export const marketColumns = [
  { id: "type", label: "Type", fixed: true },
  { id: "owner", label: "Owner" },
  { id: "bidder", label: "Bidder" },
  { id: "price", label: "Asking price" },
  { id: "status", label: "Status" },
  { id: "amount", label: "Amount Staked" },
  { id: "apy", label: "Stake APY" },
  { id: "reward", label: "Stake Reward" },
  { id: "created", label: "Stake Created", optional: true },
  { id: "expiry", label: "Order Expiry", optional: true },
  { id: "actions", label: "Actions", fixed: true },
] as const;
export type MarketColumn = (typeof marketColumns)[number]["id"];
export type MarketSort = Exclude<MarketColumn, "type" | "actions"> | "account" | "progress" | "shares" | "orderStatus";
export type StakeStatus = SignaturePosition["status"];
export type MarketFilters = MarketRangeFilters & {
  search: string;
  collections: string[];
  statuses: StakeStatus[];
  showInactive: boolean;
};
export const emptyFilters: MarketFilters = {
  search: "",
  collections: [],
  statuses: [],
  showInactive: false,
};
export const defaultColumns: MarketColumn[] = marketColumns
  .filter((column) => !("optional" in column))
  .map((column) => column.id);
export type MarketEntry = { row: SaleRow; position?: SignaturePosition };

export function filterEntries(entries: MarketEntry[], filters: MarketFilters) {
  const search = filters.search.trim().toLowerCase();
  const exact = exactStakeSearch(search), min = priceUnits(filters.minPrice, filters.currency), max = priceUnits(filters.maxPrice, filters.currency);
  const from = dateSeconds(filters.maturesFrom), to = dateSeconds(filters.maturesTo, true);
  return entries.filter(({ row, position }) => {
    const collection = stakeCollection(row.order.collection);
    return (
      (!filters.collections.length ||
        filters.collections.includes(collection.id)) &&
      (!filters.statuses.length ||
        (!!position &&
          filters.statuses.some(
            (status) => status === stakeTimeline(position).status,
          ))) &&
      (!(filters.currency || min !== undefined || max !== undefined) || (row.order.currency ?? paymentTokens[0].address).toLowerCase() === (filters.currency ?? paymentTokens[0].address).toLowerCase()) &&
      (min === undefined || BigInt(row.order.amount) >= min) &&
      (max === undefined || BigInt(row.order.amount) <= max) &&
      (from === undefined || !!position && position.maturesAt >= from) &&
      (to === undefined || !!position && position.maturesAt <= to) &&
      (exact ? row.order.tokenId === exact.tokenId && (!exact.stakeType || collection.id === exact.stakeType) :
        `${collection.name} Stake #${row.order.tokenId} ${collection.name} #${row.order.tokenId} ${row.order.owner} ${row.order.maker}`.toLowerCase().includes(search))
    );
  });
}
function sortValue({ row, position: p }: MarketEntry, field: MarketSort) {
  switch (field) {
    case "account": return BigInt(row.order.tokenId);
    case "progress": return p ? stakeTimeline(p).progress : undefined;
    case "shares": return p?.shares;
    case "orderStatus": return row.status;
    case "price":
      return BigInt(row.order.amount);
    case "owner":
      return row.order.owner.toLowerCase();
    case "bidder":
      return row.order.maker.toLowerCase();
    case "expiry":
      return BigInt(row.order.deadline);
    case "created":
      return p?.startAt;
    case "status":
      return p ? stakeTimeline(p).status : undefined;
    case "amount":
      return p?.principal;
    case "apy":
      return p ? (stakeYield(p) ?? undefined) : undefined;
    case "reward":
      return p?.unclaimedInterest;
  }
}
export function sortEntries(
  entries: MarketEntry[],
  field: MarketSort,
  direction: "asc" | "desc",
  prices: PaymentPrices = {},
) {
  const mixed = field === "price" && new Set(entries.map(e => (e.row.order.currency ?? paymentTokens[0].address).toLowerCase())).size > 1;
  return [...entries].sort((a, b) => {
    const currency = (e: MarketEntry) => e.row.order.currency ?? paymentTokens[0].address;
    const av = mixed ? paymentUsdValue(BigInt(a.row.order.amount), currency(a), prices) : sortValue(a, field),
      bv = mixed ? paymentUsdValue(BigInt(b.row.order.amount), currency(b), prices) : sortValue(b, field);
    // Unknown USD prices stay last. Do not compare raw units of different tokens.
    if (av === undefined && bv === undefined && mixed) {
      const group = currency(a).toLowerCase().localeCompare(currency(b).toLowerCase());
      if (group) return group;
      return (BigInt(a.row.order.amount) < BigInt(b.row.order.amount) ? -1 : BigInt(a.row.order.amount) > BigInt(b.row.order.amount) ? 1 : 0) * (direction === "asc" ? 1 : -1);
    }
    if (av === undefined) return bv === undefined ? 0 : 1;
    if (bv === undefined) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * (direction === "asc" ? 1 : -1);
  });
}
export function marketWise(amount?: bigint, principal = false) {
  if (amount === undefined) return "—";
  return Number(formatEther(amount)).toLocaleString("en-US", {
    minimumFractionDigits: principal && amount < 1000n * 10n ** 18n ? 2 : 0,
    maximumFractionDigits: principal || amount >= 10n ** 18n ? 2 : 6,
  });
}
export function marketUsd(amount?: bigint, price?: number) {
  if (amount === undefined || !price || !Number.isFinite(price) || price < 0)
    return "—";
  const value = Number(formatEther(amount)) * price;
  return `${value > 0 && value < 0.01 ? "<0.01" : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}
export const marketDate = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export function statusLabel(position: SignaturePosition) {
  const { status } = stakeTimeline(position);
  if (status === "Mature") return "Matured";
  if (status !== "Active") return status;
  const days = Math.max(
    1,
    Math.ceil(
      (position.maturesAt - (position.observedAt ?? Date.now() / 1000)) / 86400,
    ),
  );
  return days >= 365
    ? `${Math.ceil(days / 365)} Years Left`
    : `${days} ${days === 1 ? "Day" : "Days"} Left`;
}
export function daysServed(position: SignaturePosition) {
  const days = Math.max(
    0,
    Math.floor(
      (Math.min(position.observedAt ?? Date.now() / 1000, position.maturesAt) -
        position.startAt) /
        86400,
    ),
  );
  return `${days.toLocaleString("en-US")} ${days === 1 ? "Day" : "Days"} served`;
}
