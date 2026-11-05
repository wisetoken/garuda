import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Filter,
  LayoutGrid,
  List,
  Settings,
  RefreshCw,
  X,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import {
  defaultColumns,
  emptyFilters,
  marketColumns,
  type MarketColumn,
  type MarketFilters,
  type MarketSort,
} from "../../lib/market/presentation";

function ToolbarPopover({
  label,
  trigger,
  children,
  end = false,
  active = false,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  end?: boolean;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false),
    id = useId();
  const root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="market-popover-anchor"
      ref={root}
      data-align={end ? "end" : "start"}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={button}
        className={end ? "market-settings-button" : "market-filter-button"}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        data-active={active}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          className="market-popover"
          role="region"
          aria-label={label}
        >
          <div className="market-popover-heading">
            <strong>{label}</strong>
            <button
              aria-label={`Close ${label.toLowerCase()}`}
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
const toggleItem = <T,>(values: T[], item: T) =>
  values.includes(item)
    ? values.filter((value) => value !== item)
    : [...values, item];

type Props = {
  count: number;
  mine: boolean;
  bids: boolean;
  view: "table" | "cards";
  setView: (value: "table" | "cards") => void;
  filters: MarketFilters;
  setFilters: (value: MarketFilters) => void;
  columns: MarketColumn[];
  setColumns: (value: MarketColumn[]) => void;
  sort: MarketSort;
  direction: "asc" | "desc";
  onSort: (value: MarketSort) => void;
  refresh: () => void;
};
export function MarketToolbar(props: Props) {
  const {
    count,
    mine,
    bids,
    view,
    setView,
    filters,
    setFilters,
    columns,
    setColumns,
    sort,
    direction,
    onSort,
    refresh,
  } = props;
  const priceLabel = mine ? "Order price" : bids ? "Bid price" : "Asking price";
  const activeCount =
    Number(!!filters.search.trim()) +
    filters.collections.length +
    filters.statuses.length +
    Number(filters.showInactive);
  return (
    <>
      <div className="market-toolbar">
        <div className="market-toolbar-start">
          <strong>
            {mine ? "Your orders" : "Market stakes"} ({count})
          </strong>
          <ToolbarPopover
            label="Filter stakes"
            active={!!activeCount}
            trigger={
              <>
                <Filter size={18} />
                Filter
                {activeCount > 0 && (
                  <span className="market-filter-count">{activeCount}</span>
                )}
              </>
            }
          >
            <label className="market-search">
              Search
              <input
                value={filters.search}
                placeholder="Stake ID or address"
                onChange={(event) =>
                  setFilters({ ...filters, search: event.target.value })
                }
              />
            </label>
            <fieldset>
              <legend>Collection</legend>
              {["Signature", "Advanced"].map((name) => (
                <label key={name}>
                  <input
                    type="checkbox"
                    checked={filters.collections.includes(name.toLowerCase())}
                    onChange={() =>
                      setFilters({
                        ...filters,
                        collections: toggleItem(
                          filters.collections,
                          name.toLowerCase(),
                        ),
                      })
                    }
                  />
                  {name}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Stake status</legend>
              {(["Pending", "Active", "Mature", "Closed"] as const).map(
                (status) => (
                  <label key={status}>
                    <input
                      type="checkbox"
                      checked={filters.statuses.includes(status)}
                      onChange={() =>
                        setFilters({
                          ...filters,
                          statuses: toggleItem(filters.statuses, status),
                        })
                      }
                    />
                    {status === "Mature" ? "Matured" : status}
                  </label>
                ),
              )}
            </fieldset>
            {!mine && (
              <label>
                <input
                  type="checkbox"
                  checked={filters.showInactive}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      showInactive: event.target.checked,
                    })
                  }
                />
                Show inactive orders
              </label>
            )}
            <button
              className="market-popover-action"
              onClick={() => setFilters(emptyFilters)}
            >
              Clear filters
            </button>
          </ToolbarPopover>
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
          <ToolbarPopover
            label="Table settings"
            end
            trigger={<Settings size={18} />}
          >
            <fieldset>
              <legend>Visible columns</legend>
              {marketColumns
                .filter((column) => column.id !== "bidder" || bids)
                .map((column) => (
                  <label key={column.id}>
                    <input
                      type="checkbox"
                      checked={columns.includes(column.id)}
                      disabled={"fixed" in column}
                      onChange={() =>
                        setColumns(toggleItem(columns, column.id))
                      }
                    />
                    {column.id === "price" ? priceLabel : column.label}
                  </label>
                ))}
            </fieldset>
            <button
              className="market-popover-action"
              onClick={() => setColumns(defaultColumns)}
            >
              Reset columns
            </button>
            <button className="market-popover-action" onClick={refresh}>
              <RefreshCw size={15} />
              Refresh market
            </button>
          </ToolbarPopover>
        </div>
      </div>
      {view === "cards" && (
        <div className="market-card-sort">
          <label>
            Sort by{" "}
            <select
              value={sort}
              onChange={(event) => onSort(event.target.value as MarketSort)}
            >
              {marketColumns
                .filter(
                  (column) =>
                    column.id !== "type" &&
                    column.id !== "actions" &&
                    (column.id !== "bidder" || bids),
                )
                .map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.id === "price" ? priceLabel : column.label}
                  </option>
                ))}
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
    </>
  );
}
