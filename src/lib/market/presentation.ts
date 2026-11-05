import { formatEther } from "viem";
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
export type MarketSort = Exclude<MarketColumn, "type" | "actions">;
export type StakeStatus = SignaturePosition["status"];
export type MarketFilters = {
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
      `${collection.name} Stake #${row.order.tokenId} ${row.order.owner} ${row.order.maker}`
        .toLowerCase()
        .includes(search)
    );
  });
}
function sortValue({ row, position: p }: MarketEntry, field: MarketSort) {
  switch (field) {
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
) {
  return [...entries].sort((a, b) => {
    const av = sortValue(a, field),
      bv = sortValue(b, field);
    // Unavailable stake data stays last in either direction.
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
