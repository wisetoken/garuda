import type { ReactNode } from "react";
import { Search } from "lucide-react";
import type { StakeFilters } from "../../lib/stakes/table";

export const toggleItem = <T,>(values: T[], item: T) => values.includes(item) ? values.filter(value => value !== item) : [...values, item];
const toggleSelection = <T,>(values: T[], item: T, total: number) => {
  const next = toggleItem(values, item);
  return next.length === total ? [] : next;
};
export const collectionOptions = ["signature", "advanced"];
export const statusOptions = ["Pending", "Active", "Mature", "Closed"] as const;
export function stakeFilterCount(filters: StakeFilters) {
  return Number(!!filters.search.trim()) + Number(!!filters.collections.length && filters.collections.length < 2)
    + Number(!!filters.statuses.length && filters.statuses.length < 4);
}
export function FilterToggle({ label, count, checked, disabled, onToggle }: {
  label: string; count?: number; checked: boolean; disabled?: boolean; onToggle: () => void;
}) {
  return <button type="button" className="table-filter-toggle" aria-pressed={checked} disabled={disabled} onClick={onToggle}>
    <span>{label}{count !== undefined && <small> ({count.toLocaleString("en-US")})</small>}</span>
    <span className="table-filter-switch" aria-hidden="true"><span /></span>
  </button>;
}
export function StakeFilterFields({ filters, onChange, counts, children }: {
  filters: StakeFilters; onChange: (filters: StakeFilters) => void;
  counts?: Record<string, number>; children?: ReactNode;
}) {
  const collections = filters.collections.length ? filters.collections : collectionOptions;
  const statuses = filters.statuses.length ? filters.statuses : [...statusOptions];
  return <>
    <label className="table-filter-search"><Search size={15} /><input aria-label="Search stakes" value={filters.search}
      placeholder="Stake ID or address" onChange={event => onChange({ ...filters, search: event.target.value })} /></label>
    {children}
    <div className="table-filter-group"><p>Collection</p>
      {collectionOptions.map(id => <FilterToggle key={id} label={id === "signature" ? "Signature" : "Advanced"}
        count={counts?.[id]} checked={collections.includes(id)} disabled={collections.includes(id) && collections.length === 1}
        onToggle={() => onChange({ ...filters, collections: toggleSelection(collections, id, 2) })} />)}
    </div>
    <div className="table-filter-group"><p>Stake status</p>
      {statusOptions.map(status => <FilterToggle key={status} label={status === "Mature" ? "Matured" : status}
        count={counts?.[status]} checked={statuses.includes(status)} disabled={statuses.includes(status) && statuses.length === 1}
        onToggle={() => onChange({ ...filters, statuses: toggleSelection(statuses, status, 4) })} />)}
    </div>
  </>;
}
