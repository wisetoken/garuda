import { TablePopover } from "../table/TablePopover";
import { TableColumnSettings } from "../table/TableColumnSettings";
import type { ColumnPreference } from "../table/column-preferences";
import { MarketRangeFilters } from "./MarketRangeFilters";
import { StakeFilterFields, FilterToggle, stakeFilterCount } from "../table/StakeFilterFields";
import {
  Filter,
  LayoutGrid,
  List,
  RefreshCw,
  History,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import {
  emptyFilters,
  type MarketColumn,
  type MarketFilters,
  type MarketSort,
} from "../../lib/market/presentation";

type Props = {
  count: number;
  bids: boolean;
  view: "table" | "cards";
  setView: (value: "table" | "cards") => void;
  filters: MarketFilters;
  setFilters: (value: MarketFilters) => void;
  columns: ColumnPreference<MarketColumn>[];
  setColumns: (value: ColumnPreference<MarketColumn>[]) => void;
  resetColumns: () => void;
  counts: Record<string, number>;
  refreshing: boolean;
  sort: MarketSort;
  direction: "asc" | "desc";
  onSort: (value: MarketSort) => void;
  refresh: () => void;
  onActivity: () => void;
};
export function MarketToolbar(props: Props) {
  const {
    count,
    bids,
    view,
    setView,
    filters,
    setFilters,
    columns,
    setColumns, resetColumns, counts, refreshing,
    sort,
    direction,
    onSort,
    refresh,
    onActivity,
  } = props;
  const priceLabel = bids ? "Bid price" : "Asking price";
  const activeCount = stakeFilterCount(filters) + Number(filters.showInactive)
    + Number(!!(filters.minPrice || filters.maxPrice)) + Number(!!(filters.maturesFrom || filters.maturesTo));
  return (
    <>
      <div className="market-toolbar">
        <div className="market-toolbar-start">
          <strong>
            Market stakes ({count})
          </strong>
          <TablePopover
            label="Filter stakes"
            active={!!activeCount}
            trigger={
              <>
                <Filter size={18} />
                Filter
                {activeCount > 0 && (
                  <span className="market-filter-count" aria-label="Filters applied" />
                )}
              </>
            }
          >
            <StakeFilterFields
              filters={filters}
              counts={counts}
              onChange={(next) => setFilters({ ...filters, ...next })}
            />
            <div className="table-filter-group"><p>Order status</p>
              <FilterToggle label="Show inactive" checked={filters.showInactive}
                onToggle={() => setFilters({ ...filters, showInactive: !filters.showInactive })} />
            </div>
            <MarketRangeFilters filters={filters} onChange={ranges => setFilters({ ...filters, ...ranges })} />
            <p className="table-filter-note">Counts and stake status reflect loaded results.</p>
            <button
              className="table-filter-reset"
              onClick={() => setFilters(emptyFilters)}
            >
              Clear filters
            </button>
          </TablePopover>
          {view === "cards" && (
            <div className="market-toolbar-sort">
              <label>
                Sort by{" "}
                <select
                  aria-label="Sort market cards"
                  value={sort}
                  onChange={(event) => onSort(event.target.value as MarketSort)}
                >
                  {Object.entries({price: priceLabel, owner: "Owner", ...(bids ? {bidder: "Bidder"} : {}), amount: "Staked principal", reward: "Unclaimed interest", apy: "Annualized yield", expiry: "Order expiry", account: "Stake ID", status: "Stake status", created: "Start date", progress: "Term elapsed", shares: "Shares", orderStatus: "Order status"}).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <button
                aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`}
                onClick={() => onSort(sort)}
              >
                {direction === "asc" ? (
                  <ArrowUp size={16} />
                ) : (
                  <ArrowDown size={16} />
                )}
          </button>
        </div>
      )}
        </div>
        <div className="market-toolbar-end">
          <div
            className="stake-view-switch"
            role="group"
            aria-label="Market view"
          >
            <button
              aria-pressed={view === "cards"}
              onClick={() => setView("cards")}
            >
              <LayoutGrid size={16} />
              Cards
            </button>
            <button
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
            >
              <List size={16} />
              Table
            </button>
          </div>
          {view === "table" && <TableColumnSettings
            columns={columns.map(column => ({ ...column, label: column.id === "price" ? priceLabel : column.label }))}
            onChange={setColumns} onReset={resetColumns} exclude={bids ? [] : ["bidder"]} />}
          <button type="button" className="market-settings-button" onClick={onActivity}
            aria-label="Market activity" title="Activity" aria-haspopup="dialog">
            <History size={16} aria-hidden="true" />
          </button>
          <button type="button" className="market-settings-button" disabled={refreshing} onClick={refresh} aria-label="Refresh market">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

    </>
  );
}
