import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  ChevronsUpDown,
  CircleCheck,
  Clock3,
} from "lucide-react";
import type { SaleRow } from "../../lib/blend/sales";
import type { SignaturePosition } from "../../lib/blend/live-portfolio";
import { stakeCollection } from "../../lib/blend/stake-collections";
import { stakeTimeline, stakeYield } from "../../lib/blend/stake-art";
import {
  marketColumns,
  marketWise,
  marketUsd,
  marketDate,
  statusLabel,
  daysServed,
  type MarketColumn,
  type MarketSort,
  type MarketEntry,
} from "../../lib/market/presentation";
import { useOrderPosition } from "../../lib/market/queries";
import { orderAvailable } from "../../lib/market/api";
import { useWiseUsd } from "../../lib/portfolio";
import { AddressIdentity } from "../AddressIdentity";
import { RowActions } from "./OrderViews";

function OrderRow({
  row,
  position: p,
  columns,
  selected,
  onSelect,
}: {
  row: SaleRow;
  position?: SignaturePosition;
  columns: MarketColumn[];
  selected: boolean;
  onSelect: () => void;
}) {
  const { data: usd } = useWiseUsd(),
    position = useOrderPosition(row);
  const timeline = p ? stakeTimeline(p) : undefined,
    yieldValue = p ? stakeYield(p) : null;
  const label = `${stakeCollection(row.order.collection).name} Stake #${row.order.tokenId}`;
  const cells: Record<MarketColumn, ReactNode> = {
    type: (
      <button
        className="stake-type market-type"
        data-status={timeline?.status}
        aria-label={`View ${label} details`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <ArrowLeftRight size={14} aria-hidden="true" />
        <span role="tooltip">{label}</span>
      </button>
    ),
    owner: <AddressIdentity address={row.order.owner} />,
    bidder: <AddressIdentity address={row.order.maker} />,
    price: (
      <>
        {marketWise(BigInt(row.order.amount))} WISE
        <small>{marketUsd(BigInt(row.order.amount), usd)}</small>
      </>
    ),
    status: (
      <>
        <span className="market-status" data-status={timeline?.status}>
          {timeline?.status === "Mature" ? (
            <CircleCheck size={13} />
          ) : (
            <Clock3 size={13} />
          )}
          {p ? statusLabel(p) : "Checking…"}
        </span>
        {p && (
          <small>
            {timeline?.status === "Mature" || timeline?.status === "Closed"
              ? "On"
              : "Till"}{" "}
            {marketDate(p.maturesAt)}
          </small>
        )}
        {!orderAvailable(row) && (
          <small>
            {row.status === "checking"
              ? "Verifying order…"
              : row.status.replaceAll("-", " ")}
          </small>
        )}
      </>
    ),
    amount: (
      <>
        {p ? `${marketWise(p.principal, true)} WISE` : "—"}
        <small>{marketUsd(p?.principal, usd)}</small>
      </>
    ),
    apy: (
      <>
        <span
          className="market-yield"
          data-mature={timeline?.status === "Mature"}
          title="Simple annualized yield, based on past accrued interest. Future returns may vary."
        >
          {yieldValue === null ? "—" : `${yieldValue.toFixed(2)}%`}
        </span>
        <small>{p ? daysServed(p) : "—"}</small>
      </>
    ),
    reward: (
      <>
        <span className="market-yield">
          {p?.unclaimedInterest === undefined
            ? "—"
            : `+${marketWise(p.unclaimedInterest)} WISE`}
        </span>
        <small>
          {p?.unclaimedInterest !== undefined && usd ? "+" : ""}
          {marketUsd(p?.unclaimedInterest, usd)}
        </small>
      </>
    ),
    created: p ? marketDate(p.startAt) : "—",
    expiry: (
      <>
        {marketDate(Number(row.order.deadline))}
        <small>UTC</small>
      </>
    ),
    actions: (
      <>
        <RowActions row={row} position={p} />
        {position.isError && (
          <button
            className="market-retry"
            onClick={() => void position.refetch()}
          >
            Retry stake details
          </button>
        )}
      </>
    ),
  };
  return (
    <tr
      data-selected={selected}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("a, button, input"))
          onSelect();
      }}
    >
      {columns.map((id) => (
        <td key={id} data-column={id}>
          {cells[id]}
        </td>
      ))}
    </tr>
  );
}
export function MarketTable({
  entries,
  columns,
  sort,
  direction,
  onSort,
  selected,
  onSelect,
  bids,
  mine,
}: {
  entries: MarketEntry[];
  columns: MarketColumn[];
  sort: MarketSort;
  direction: "asc" | "desc";
  onSort: (value: MarketSort) => void;
  selected?: string;
  onSelect: (hash: string) => void;
  bids: boolean;
  mine: boolean;
}) {
  const visible = marketColumns.filter(
    (column) => columns.includes(column.id) && (column.id !== "bidder" || bids),
  );
  return (
    <div
      className="market-table-scroll"
      role="region"
      aria-label="Stake orders"
      tabIndex={0}
    >
      <table className="market-table">
        <caption className="sr-only">
          {mine ? "Your orders" : bids ? "Purchase bids" : "Stakes for sale"}
        </caption>
        <thead>
          <tr>
            {visible.map((column) => {
              const sortable = column.id !== "type" && column.id !== "actions";
              const label =
                column.id === "price"
                  ? mine
                    ? "Order price"
                    : bids
                      ? "Bid price"
                      : "Asking price"
                  : column.label;
              return (
                <th
                  key={column.id}
                  data-column={column.id}
                  aria-sort={
                    sort === column.id
                      ? direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {sortable ? (
                    <button onClick={() => onSort(column.id as MarketSort)}>
                      {label}
                      {sort !== column.id ? (
                        <ChevronsUpDown size={13} />
                      ) : direction === "asc" ? (
                        <ArrowUp size={15} />
                      ) : (
                        <ArrowDown size={15} />
                      )}
                    </button>
                  ) : (
                    label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <OrderRow
              key={entry.row.hash}
              {...entry}
              columns={visible.map((column) => column.id)}
              selected={selected === entry.row.hash}
              onSelect={() => onSelect(entry.row.hash)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
