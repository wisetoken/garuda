import { useState, type ReactNode } from "react";
import { Filter, RefreshCw } from "lucide-react";
import type { SignaturePosition } from "../../lib/blend/live-portfolio";
import { stakeTimeline } from "../../lib/blend/stake-art";
import { useWiseUsd } from "../../lib/portfolio";
import {
  emptyStakeFilters, filterStakes, sortStakes, stakeColumns, stakeName,
  type StakeColumn, type StakeSort,
} from "../../lib/stakes/table";
import { TableHeader } from "../table/TableHeader";
import { TablePopover } from "../table/TablePopover";
import { TableColumnSettings } from "../table/TableColumnSettings";
import { useTableColumns } from "../table/useTableColumns";
import { stakeCollection, STAKE_COLLECTIONS } from "../../lib/blend/stake-collections";
import { StakeFilterFields, stakeFilterCount } from "../table/StakeFilterFields";
import { StakeTypeCell, StakeStatusCell, StakeAmountCell, StakeYieldCell, StakeRewardCell } from "../table/StakeTableCells";
import { StakeCreatedCell, StakeProgressCell } from "./StakeTimelineCells";
import "../market.css";
import "../market/market-controls.css";
import "../market/market-table.css";
import "./stakes-table.css";

type Props = {
  positions: SignaturePosition[];
  actionsBlocked: boolean;
  onList: (position: SignaturePosition) => void;
  onRefresh: () => void;
  refreshing: boolean;
};

function StakeRow({ position, columns, usd, onList, actionsBlocked }: {
  position: SignaturePosition;
  columns: StakeColumn[];
  usd?: number;
  onList: () => void;
  actionsBlocked: boolean;
}) {
  const name = stakeName(position);
  const cells: Record<StakeColumn, ReactNode> = {
    type: <StakeTypeCell label={name} status={stakeTimeline(position).status} />,
    created: <StakeCreatedCell position={position} />,
    progress: <StakeProgressCell position={position} />,
    status: <StakeStatusCell position={position} />,
    amount: <StakeAmountCell position={position} usd={usd} />,
    apy: <StakeYieldCell position={position} />,
    reward: <StakeRewardCell position={position} usd={usd} />,
    actions: <div className="market-row-actions"><button className="market-primary"
      disabled={actionsBlocked || !position.canList} onClick={onList}
      aria-label={`List ${name} for sale`}>List for sale</button></div>,
  };
  return <tr>{columns.map((id) => <td key={id} data-column={id}>{cells[id]}</td>)}</tr>;
}

export function StakesTable({ positions, actionsBlocked, onList, onRefresh, refreshing }: Props) {
  const { data: usd } = useWiseUsd();
  const [filters, setFilters] = useState(emptyStakeFilters);
  const settings = useTableColumns("garuda:stakes:columns:v1", stakeColumns);
  const [sort, setSort] = useState<StakeSort>("created");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const entries = sortStakes(filterStakes(positions, filters), sort, direction);
  const visible = settings.visible.map(id => stakeColumns.find(column => column.id === id)!);
  const activeCount = stakeFilterCount(filters);
  const counts: Record<string, number> = { signature: 0, advanced: 0, Pending: 0, Active: 0, Mature: 0, Closed: 0 };
  for (const position of positions) {
    counts[stakeCollection(position.collection ?? STAKE_COLLECTIONS.signature.address).id]++;
    counts[stakeTimeline(position).status]++;
  }
  function onSort(id: StakeColumn) {
    if (id === "type" || id === "actions") return;
    setDirection(id === sort && direction === "desc" ? "asc" : "desc");
    setSort(id);
  }
  return <section className="market-panel stakes-table-panel" aria-label="Your NFT stakes">
    <div className="market-toolbar">
      <div className="market-toolbar-start">
        <strong>Your NFT stakes ({entries.length})</strong>
        <TablePopover label="Filter stakes" active={!!activeCount} trigger={<>
          <Filter size={18} aria-hidden="true" />Filter
          {activeCount > 0 && <span className="market-filter-count" aria-label="Filters applied" />}
        </>}>
          <StakeFilterFields filters={filters} onChange={setFilters} counts={counts} />
          <button className="table-filter-reset" onClick={() => setFilters(emptyStakeFilters)}>Clear filters</button>
        </TablePopover>
      </div>
      <div className="market-toolbar-end">
        <TableColumnSettings columns={settings.columns} onChange={settings.update} onReset={settings.reset} />
        <button type="button" className="market-settings-button" disabled={refreshing} onClick={onRefresh} aria-label="Refresh stakes">
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
    <div className="market-table-scroll" role="region" aria-label="Your NFT stakes table" tabIndex={0}>
      <table className="market-table portfolio-stakes-table">
        <caption className="sr-only">Your NFT stakes</caption>
        <TableHeader columns={visible.map((column) => ({ ...column, sortable: !("fixed" in column) }))}
          sort={sort} direction={direction} onSort={onSort} />
        <tbody>{entries.map((position) => <StakeRow key={`${position.collection}:${position.tokenId}`}
          position={position} columns={visible.map(({ id }) => id)} usd={usd}
          actionsBlocked={actionsBlocked} onList={() => onList(position)} />)}</tbody>
      </table>
      {!entries.length && <div className="market-empty" role="status">
        <p>No stakes match these filters.</p>
        <button className="market-secondary" onClick={() => setFilters(emptyStakeFilters)}>Clear filters</button>
      </div>}
    </div>
  </section>;
}
