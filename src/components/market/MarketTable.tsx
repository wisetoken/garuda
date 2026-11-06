import { TableHeader } from "../table/TableHeader";
import { StakeTypeCell, StakeStatusCell, StakeAmountCell, StakeYieldCell, StakeRewardCell } from "../table/StakeTableCells";
import type { ReactNode } from "react";
import type { SaleRow } from "../../lib/blend/sales";
import type { SignaturePosition } from "../../lib/blend/live-portfolio";
import { stakeCollection } from "../../lib/blend/stake-collections";
import { stakeTimeline } from "../../lib/blend/stake-art";
import {
  marketColumns,
  marketWise,
  marketUsd,
  marketDate,
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
}: {
  row: SaleRow;
  position?: SignaturePosition;
  columns: MarketColumn[];
}) {
  const { data: usd } = useWiseUsd(),
    position = useOrderPosition(row);
  const timeline = p ? stakeTimeline(p) : undefined;
  const label = `${stakeCollection(row.order.collection).name} Stake #${row.order.tokenId}`;
  const cells: Record<MarketColumn, ReactNode> = {
    type: <StakeTypeCell label={label} status={timeline?.status} />,
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
        <StakeStatusCell position={p} />
        {!orderAvailable(row) && (
          <small>
            {row.status === "checking"
              ? "Verifying order…"
              : row.status.replaceAll("-", " ")}
          </small>
        )}
      </>
    ),
    amount: <StakeAmountCell position={p} usd={usd} />,
    apy: <StakeYieldCell position={p} />,
    reward: <StakeRewardCell position={p} usd={usd} />,
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
    <tr>
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
  bids,
}: {
  entries: MarketEntry[];
  columns: MarketColumn[];
  sort: MarketSort;
  direction: "asc" | "desc";
  onSort: (value: MarketSort) => void;
  bids: boolean;
}) {
  const visible = columns.filter(id => id !== "bidder" || bids).map(id => marketColumns.find(column => column.id === id)!);
  return (
    <div
      className="market-table-scroll"
      role="region"
      aria-label="Stake orders"
      tabIndex={0}
    >
      <table className="market-table">
        <caption className="sr-only">
          {bids ? "Purchase bids" : "Stakes for sale"}
        </caption>
        <TableHeader
          columns={visible.map((column) => ({
            ...column,
            sortable: column.id !== "type" && column.id !== "actions",
            label: column.id === "price" ? bids ? "Bid price" : "Asking price" : column.label,
          }))}
          sort={sort}
          direction={direction}
          onSort={(id) => onSort(id as MarketSort)}
        />
        <tbody>
          {entries.map((entry) => (
            <OrderRow
              key={entry.row.hash}
              {...entry}
              columns={visible.map((column) => column.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
