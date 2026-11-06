import type { SignaturePosition } from "../blend/live-portfolio";
import { stakeCollection, STAKE_COLLECTIONS } from "../blend/stake-collections";
import { stakeTimeline, stakeYield } from "../blend/stake-art";

export const stakeColumns = [
  { id: "type", label: "Type", fixed: true },
  { id: "created", label: "Stake Created" },
  { id: "progress", label: "Maturity Progress" },
  { id: "status", label: "Status" },
  { id: "amount", label: "Amount Staked" },
  { id: "apy", label: "Stake APY" },
  { id: "reward", label: "Stake Reward" },
  { id: "actions", label: "Actions", fixed: true },
] as const;
export type StakeColumn = (typeof stakeColumns)[number]["id"];
export type StakeSort = Exclude<StakeColumn, "type" | "actions">;
export const defaultStakeColumns: StakeColumn[] = stakeColumns.map(({ id }) => id);
export type StakeFilters = {
  search: string;
  collections: string[];
  statuses: SignaturePosition["status"][];
};
export const emptyStakeFilters: StakeFilters = { search: "", collections: [], statuses: [] };
export function stakeName(position: SignaturePosition) {
  return `${stakeCollection(position.collection ?? STAKE_COLLECTIONS.signature.address).name} Stake #${position.tokenId}`;
}
export function stakeCreatedAt(position: SignaturePosition) {
  const created = Number(position.displayStake?.createdAtTimestamp);
  return Number.isFinite(created) && created > 0 ? created : position.startAt;
}
export function filterStakes(positions: SignaturePosition[], filters: StakeFilters) {
  const search = filters.search.trim().toLowerCase();
  return positions.filter((position) => {
    const collection = stakeCollection(position.collection ?? STAKE_COLLECTIONS.signature.address);
    return (!filters.collections.length || filters.collections.includes(collection.id)) &&
      (!filters.statuses.length || filters.statuses.includes(stakeTimeline(position).status)) &&
      `${stakeName(position)} ${collection.name} #${position.tokenId} ${position.owner}`.toLowerCase().includes(search);
  });
}
function sortValue(position: SignaturePosition, field: StakeSort) {
  switch (field) {
    case "created": return stakeCreatedAt(position);
    case "progress": return stakeTimeline(position).progress;
    case "status": return { Pending: 0, Active: 1, Mature: 2, Closed: 3 }[stakeTimeline(position).status];
    case "amount": return position.principal;
    case "apy": return stakeYield(position) ?? undefined;
    case "reward": return position.unclaimedInterest;
  }
}
export function sortStakes(positions: SignaturePosition[], field: StakeSort, direction: "asc" | "desc") {
  return [...positions].sort((a, b) => {
    const av = sortValue(a, field), bv = sortValue(b, field);
    if (av === undefined) return bv === undefined ? 0 : 1;
    if (bv === undefined) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * (direction === "asc" ? 1 : -1);
  });
}
