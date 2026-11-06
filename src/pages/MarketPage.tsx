import { useErrorToast } from "../components/AppToast";
import { ArkivSource } from "../components/market/ArkivSource";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, LoaderCircle } from "lucide-react";
import { GarudaPageKicker } from "../components/GarudaPageKicker";
import { OrderCard } from "../components/market/OrderViews";
import { MarketTable } from "../components/market/MarketTable";
import { MarketToolbar } from "../components/market/MarketToolbar";
import { MarketActivityDialog } from "../components/market/MarketActivityDialog";
import { useMarkets, orderAvailable } from "../lib/market/api";
import { useBook, useOrderPositions, useOrderAvailability } from "../lib/market/queries";
import {
  marketColumns,
  emptyFilters,
  filterEntries,
  sortEntries,
  type MarketSort,
  type MarketFilters,
} from "../lib/market/presentation";
import { columnsForView } from "../components/table/column-preferences";
import { useTableColumns } from "../components/table/useTableColumns";
import { useMarketFilters } from "../lib/market/useMarketFilters";
import { stakeCollection } from "../lib/blend/stake-collections";
import { stakeTimeline } from "../lib/blend/stake-art";
import { screenHref } from "../navigation";
import "../components/market.css";
import "../components/market/market-table.css";
import "../components/market/market-controls.css";

export function MarketPage() {
  const markets = useMarkets();
  const deployments = markets.map((query) =>
    query.data?.enabled ? query.data.deployment : undefined,
  );
  const [params, setParams] = useSearchParams();
  const activityOpen = params.get("view") === "activity";
  const [view, setView] = useState<"table" | "cards">("table");
  const book = params.get("book") === "bids" ? "bids" : "listings";
  const source = params.get("source") === "catalog" ? "catalog" : "arkiv";
  function setSource(value: "arkiv" | "catalog") {
    setParams(current=> {const next=new URLSearchParams(current); next.set("source",value);return next;});
  }
  function setBook(value: "listings" | "bids") {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "bids") next.set("book", "bids");
      else next.delete("book");
      return next;
    });
  }
  const [filters, setFilters] = useState<MarketFilters>(emptyFilters);
  const columnSettings = useTableColumns("garuda:market:columns:v1", marketColumns);
  const remoteFilters = useMarketFilters(filters);
  const [sort, setSort] = useState<MarketSort>("price"),
    [direction, setDirection] = useState<"asc" | "desc">("asc");
  const indexedSort = sort === "amount" ? "principal" : sort === "expiry" ? "expires" : sort === "created" ? "stakeStartAt" : "price";
  const signature = useBook("signature", deployments[0], source, book === "bids" ? "bid" : "listing", indexedSort, direction, remoteFilters.query),
    advanced = useBook("advanced", deployments[1], source, book === "bids" ? "bid" : "listing", indexedSort, direction, remoteFilters.query);
  const pages = [
    ...(signature.data?.pages ?? []),
    ...(advanced.data?.pages ?? []),
  ];
  const indexedRows = Array.from(
    new Map(
      pages.flatMap((page) => page.orders).map((row) => [row.hash, row]),
    ).values(),
  );
  const availability = useOrderAvailability(indexedRows);
  const rows = indexedRows.map((row,index) => ({...row,
    status:row.status === "checking" && !availability[index].isError ? availability[index].data ?? row.status : row.status,
  }));
  const positions = useOrderPositions(rows);
  const bids = book === "bids";
  const entries = rows
    .map((row, index) => ({ row, position: positions[index].data }))
    .filter(({ row }) =>
      row.order.kind === (bids ? 1 : 0) &&
      (filters.showInactive || orderAvailable(row) || row.status === "checking"),
    );
  const viewColumns = columnsForView(columnSettings.columns, bids ? [] : ["bidder"]);
  const counts: Record<string, number> = { signature: 0, advanced: 0, Pending: 0, Active: 0, Mature: 0, Closed: 0 };
  for (const {row, position} of entries) {
    counts[stakeCollection(row.order.collection).id]++;
    if (position) counts[stakeTimeline(position).status]++;
  }
  const filtered = sortEntries(
    filterEntries(entries, filters),
    sort,
    direction,
  );
  const loading =
    remoteFilters.pending || markets.some((query) => query.isPending) ||
    deployments.some(
      (deployment, index) =>
        deployment && [signature, advanced][index].isPending,
    );
  const unavailable =
    markets.some((query) => query.isError) ||
    signature.isError ||
    advanced.isError;
  const pageEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = pageEnd.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      // Keep pagination lazy, avoid duplicate requests, and let the existing
      // retry notification handle failures rather than looping on an outage.
      if (signature.hasNextPage && !signature.isFetching && !signature.isError)
        void signature.fetchNextPage({ cancelRefetch: false });
      if (advanced.hasNextPage && !advanced.isFetching && !advanced.isError)
        void advanced.fetchNextPage({ cancelRefetch: false });
    }, { rootMargin: "240px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [signature.hasNextPage, signature.isFetching, signature.isError,
    signature.data?.pages.length, signature.fetchNextPage,
    advanced.hasNextPage, advanced.isFetching, advanced.isError,
    advanced.data?.pages.length, advanced.fetchNextPage]);
  function refresh() {
    markets.forEach((query) => void query.refetch());
    if (deployments[0]) void signature.refetch();
    if (deployments[1]) void advanced.refetch();
    positions.forEach((query) => void query.refetch());
    availability.forEach((query) => void query.refetch());
  }
  const fetching = markets.some(query => query.isFetching) || signature.isFetching || advanced.isFetching;
  useErrorToast("market-data", unavailable && !fetching && "Could not refresh the market. Please try again.", refresh);
  useErrorToast("market-availability", availability.some(query => query.isError && !query.isFetching) && "Could not verify order availability. Please try again.", refresh);
  useErrorToast("market-positions", positions.some(query => query.isError && !query.isFetching) && "Could not refresh stake details. Please try again.", refresh);
  function onSort(value: MarketSort) {
    if (sort === value) setDirection(direction === "asc" ? "desc" : "asc");
    else {
      setSort(value);
      setDirection("asc");
    }
  }
  function setActivityOpen(open: boolean) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("view", open ? "activity" : "market");
      return next;
    }, { replace: true });
  }
  return (
    <>
      <title>Market | WiseOne | Garuda Extension</title>
      <div className="stakes-page-heading market-page-heading">
        <GarudaPageKicker
          label="THE STAKE MARKET"
          description="List a position, make a purchase bid, or buy a stake using WISE."
        />
        <h1>A new owner. The same stake.</h1>
      </div>
      <section className="market-panel" aria-label="WiseOne NFT stake market">
        <header className="market-heading">
          <div>
            <h2>WiseOne NFT stakes</h2>
            <p>Buy and sell complete stake ownership</p>
          </div>
          <Link className="market-primary" to={screenHref("stakes")}>
            <Plus size={18} />
            List a stake
          </Link>
        </header>
        <div className="market-tabs" role="group" aria-label="Order book">
          <button aria-pressed={book === "listings"} onClick={() => setBook("listings")}>
            For sale
          </button>
          <button aria-pressed={bids} onClick={() => setBook("bids")}>
            Purchase bids
          </button>
          <span>Buying transfers ownership</span>
        </div>
        <ArkivSource source={source} onChange={setSource} />
        <MarketToolbar
          count={filtered.length}
          bids={bids}
          view={view}
          setView={setView}
          filters={filters}
          setFilters={setFilters}
          columns={viewColumns}
          setColumns={columnSettings.update}
          resetColumns={columnSettings.reset}
          counts={counts}
          refreshing={fetching}
          sort={sort}
          direction={direction}
          onSort={onSort}
          refresh={refresh}
          onActivity={() => setActivityOpen(true)}
        />
        {!filtered.length ? (
          <div className="market-empty" role="status">
            {loading
                ? <span className="market-loading"><LoaderCircle size={16} aria-hidden="true" /><span>{source === "arkiv" ? "Loading orders from Arkiv…" : "Loading market orders…"}</span></span>
                : unavailable
                  ? <button className="market-secondary" disabled={fetching} onClick={refresh}>{fetching ? "Refreshing…" : "Refresh market"}</button>
                  : "No matching orders right now."}
          </div>
        ) : view === "table" ? (
          <MarketTable
            entries={filtered}
            columns={viewColumns.filter(column => column.enabled).map(column => column.id)}
            sort={sort}
            direction={direction}
            onSort={onSort}
            bids={bids}
          />
        ) : (
          <div className="stakes-grid market-grid">
            {filtered.map(({ row }) => (
              <OrderCard key={row.hash} row={row} />
            ))}
          </div>
        )}
        <div ref={pageEnd} className="market-page-end" aria-hidden="true" />
      </section>
      {activityOpen && <MarketActivityDialog
        books={pages}
        loading={loading}
        unavailable={unavailable}
        refreshing={fetching}
        onRefresh={refresh}
        onClose={() => setActivityOpen(false)}
      />}
    </>
  );
}
