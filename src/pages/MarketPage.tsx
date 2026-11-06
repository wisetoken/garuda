import { paymentSchema } from "../lib/blend/payment-tokens";
import { usePaymentPrices } from "../lib/market/payment-prices";
import { useAppToast, useErrorToast } from "../components/AppToast";
import { useQueryClient } from "@tanstack/react-query";
import { ArkivSource } from "../components/market/ArkivSource";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HandCoins, LoaderCircle, Plus, Tag } from "lucide-react";
import { GarudaPageKicker } from "../components/GarudaPageKicker";
import { OrderCard } from "../components/market/OrderViews";
import { MarketTable } from "../components/market/MarketTable";
import { MarketToolbar } from "../components/market/MarketToolbar";
import { MarketActivityDialog } from "../components/market/MarketActivityDialog";
import { useMarkets, orderAvailable } from "../lib/market/api";
import { useBook, useOrderPositions } from "../lib/market/queries";
import type { SaleRow } from "../lib/blend/sales";
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
  const prices = usePaymentPrices();
  const { showToast } = useAppToast();
  const queryClient = useQueryClient();
  const markets = useMarkets();
  const deployments = markets.map((query) =>
    query.data?.enabled ? query.data.deployment : undefined,
  );
  const [params, setParams] = useSearchParams();
  const activityOpen = params.get("view") === "activity";
  const [view, setView] = useState<"table" | "cards">("cards");
  const book = params.get("book") === "bids" ? "bids" : "listings";
  const source = params.get("source") === "catalog" ? "catalog" : "arkiv";
  const [useCache, setUseCache] = useState(() => {
    try { return localStorage.getItem("garuda:market:use-cache:v1") === "1"; }
    catch { return false; }
  });
  function refetchActiveBook(nextBook: "listings" | "bids" = book) {
    const kind = nextBook === "bids" ? "bid" : "listing";
    for (const [index, deployment] of deployments.entries()) {
      if (!deployment) continue;
      const id = index === 0 ? "signature" : "advanced";
      void queryClient.invalidateQueries({
        queryKey: ["market-book", id, deployment.adapter, source, source === "arkiv" ? kind : null],
      });
    }
  }
  function onCacheChange(enabled: boolean) {
    setUseCache(enabled);
    try { localStorage.setItem("garuda:market:use-cache:v1", enabled ? "1" : "0"); }
    catch { /* The choice remains for this visit. */ }
    if (!enabled) refetchActiveBook();
  }
  const sourceSwitch = useRef<{ source: "arkiv" | "catalog"; started: number; cached: boolean } | null>(null);
  function setBook(value: "listings" | "bids") {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "bids") next.set("book", "bids");
      else next.delete("book");
      return next;
    });
    if (!useCache && value !== book && source === "arkiv") refetchActiveBook(value);
  }
  const [filters, setFilters] = useState<MarketFilters>(emptyFilters);
  const columnSettings = useTableColumns("garuda:market:columns:v1", marketColumns);
  const remoteFilters = useMarketFilters(filters);
  const [sort, setSort] = useState<MarketSort>("price"),
    [direction, setDirection] = useState<"asc" | "desc">("asc");
  const indexedSort = sort === "shares" ? "shares" : sort === "amount" ? "principal" : sort === "expiry" ? "expires" : sort === "created" ? "stakeStartAt" : filters.currency || !deployments.some(d => d && paymentSchema(d) === 2) ? "price" : "publishedAt";
  function setSource(value: "arkiv" | "catalog") {
    if (value === source) return;
    const kind = value === "arkiv" ? (book === "bids" ? "bid" : "listing") : null;
    if (!useCache) { reloadSource(value); return; }
    const cached = deployments.every((deployment, index) => {
      if (!deployment) return true;
      const id = index === 0 ? "signature" : "advanced";
      return !!queryClient.getQueryState(["market-book", id, deployment.adapter, value, kind, indexedSort, direction, value === "arkiv" ? remoteFilters.query : null, "checked"])?.data;
    });
    sourceSwitch.current = { source: value, started: performance.now(), cached };
    setParams(current => { const next = new URLSearchParams(current); next.set("source", value); return next; });
  }
  function reloadSource(value: "arkiv" | "catalog") {
    sourceSwitch.current = { source: value, started: performance.now(), cached: false };
    for (const [index, deployment] of deployments.entries()) {
      if (!deployment) continue;
      const id = index === 0 ? "signature" : "advanced";
      void queryClient.invalidateQueries({ queryKey: ["market-book", id, deployment.adapter, value] });
    }
    if (value === source) return;
    setParams(current => { const next = new URLSearchParams(current); next.set("source", value); return next; });
  }
  const listingSignature = useBook("signature", deployments[0], source, "listing", indexedSort, direction, remoteFilters.query, useCache),
    listingAdvanced = useBook("advanced", deployments[1], source, "listing", indexedSort, direction, remoteFilters.query, useCache),
    bidSignature = useBook("signature", deployments[0], source, "bid", indexedSort, direction, remoteFilters.query, useCache),
    bidAdvanced = useBook("advanced", deployments[1], source, "bid", indexedSort, direction, remoteFilters.query, useCache);
  const listingQueries = [listingSignature, listingAdvanced];
  const bidQueries = [bidSignature, bidAdvanced];
  const [signature, advanced] = book === "bids" ? bidQueries : listingQueries;
  const pages = [
    ...(signature.data?.pages ?? []),
    ...(advanced.data?.pages ?? []),
  ];
  const rows = Array.from(
    new Map(pages.flatMap(page => page.orders).map(row => [row.hash, row])).values(),
  );
  // Evaluate deadlines at the checked response, not on unrelated UI renders.
  const available = new Set(pages.flatMap(page => page.orders.filter(row => orderAvailable(row, page.checkedAt)).map(row => row.hash)));
  const positions = useOrderPositions(rows);
  const bids = book === "bids";
  const entries = rows
    .map((row, index) => ({ row, position: positions[index].data }))
    .filter(({ row }) =>
      row.order.kind === (bids ? 1 : 0) &&
      (filters.showInactive || available.has(row.hash)),
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
    prices,
  );
  const needsPositions = filters.statuses.length > 0 || !!filters.maturesFrom || !!filters.maturesTo ||
    ["progress", "shares", "created", "status", "amount", "apy", "reward"].includes(sort);
  const loading =
    (needsPositions && positions.some(query => query.isPending)) ||
    remoteFilters.pending || markets.some((query) => query.isPending) ||
    deployments.some(
      (deployment, index) =>
        deployment && [signature, advanced][index].isPending,
    );
  const unavailable =
    markets.some(query => query.isError && !query.data) ||
    (signature.isError && !signature.data) ||
    (advanced.isError && !advanced.data);
  const pageEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = pageEnd.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      // Keep pagination lazy, avoid duplicate requests, and let the existing
      // retry notification handle failures rather than looping on an outage.
      for (const query of source === "arkiv" ? [...listingQueries, ...bidQueries] : listingQueries) {
        if (query.hasNextPage && !query.isFetching && !query.isError)
          void query.fetchNextPage({ cancelRefetch: false });
      }
    }, { rootMargin: "240px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [source, listingSignature.hasNextPage, listingSignature.isFetching, listingSignature.isError,
    listingSignature.data?.pages.length, listingSignature.fetchNextPage,
    listingAdvanced.hasNextPage, listingAdvanced.isFetching, listingAdvanced.isError,
    listingAdvanced.data?.pages.length, listingAdvanced.fetchNextPage,
    bidSignature.hasNextPage, bidSignature.isFetching, bidSignature.isError,
    bidSignature.data?.pages.length, bidSignature.fetchNextPage,
    bidAdvanced.hasNextPage, bidAdvanced.isFetching, bidAdvanced.isError,
    bidAdvanced.data?.pages.length, bidAdvanced.fetchNextPage]);
  function refresh() {
    markets.forEach((query) => void query.refetch());
    for (const [index, query] of [...listingQueries, ...bidQueries].entries())
      if (deployments[index % 2]) void query.refetch();
    positions.forEach((query) => void query.refetch());
  }
  const fetching = markets.some(query => query.isFetching) || [...listingQueries, ...bidQueries].some(query => query.isFetching);
  const closedQueries = bids ? listingQueries : bidQueries;
  const closedOrders = collectOrders(closedQueries).filter((row) => row.order.kind === (bids ? 0 : 1));
  const closedPages = closedQueries.flatMap(query => query.data?.pages ?? []);
  const closedAvailable = new Set(closedPages.flatMap(page => page.orders.filter(row => orderAvailable(row, page.checkedAt)).map(row => row.hash)));
  const closedVisible = closedOrders.filter(row => filters.showInactive || closedAvailable.has(row.hash)).length;
  const closedCount = {
    count: closedVisible,
    pending: closedQueries.some((query, index) => deployments[index] && query.isPending),
    failed: closedQueries.some((query, index) => deployments[index] && query.isError && !query.data),
  };
  const openCount = { count: filtered.length, pending: loading, failed: unavailable };
  const saleCount = bids ? closedCount : openCount;
  const bidCount = bids ? openCount : closedCount;
  useEffect(() => {
    const mark = sourceSwitch.current;
    if (!mark || mark.source !== source) return;
    const active = [signature, advanced];
    const ready = deployments.some(Boolean) && deployments.every((deployment, index) => !deployment || (!active[index].isFetching && (active[index].data || active[index].isError)));
    if (!ready) return;
    if (active.some(query => query.isError)) { sourceSwitch.current = null; return; }
    const seconds = (performance.now() - mark.started) / 1000;
    const time = seconds < 0.1 ? "<0.1s" : `${seconds.toFixed(1)}s`;
    showToast(`${source === "arkiv" ? "Arkiv" : "Graph"} loaded in ${time}. ${mark.cached ? "Cached." : "Not cached."}`, { id: `market-source-${mark.started}` });
    sourceSwitch.current = null;
  }, [source, deployments, signature, advanced, showToast]);
  const marketError = [signature, advanced, ...markets].find(query => query.error)?.error?.message ?? "Could not refresh the market. Please try again.";
  useErrorToast("market-data", [signature, advanced, ...markets].some(query => query.isError) && !fetching && marketError, refresh);
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
      if (open) next.set("view", "activity");
      else next.delete("view");
      return next;
    }, { replace: true });
  }
  return (
    <>
      <title>Market | WiseOne | Garuda Extension</title>
      <div className="stakes-page-heading market-page-heading">
        <GarudaPageKicker
          label="THE STAKE MARKET"
          description="List a position, make a purchase bid, or buy an existing WISE stake."
        />
        <div className="stakes-title-row">
          <h1>A new owner. The same stake.</h1>
          <div className="stake-view-switch" role="group" aria-label="Order book">
            <button aria-pressed={book === "listings"} onClick={() => setBook("listings")}>
              <Tag size={15} aria-hidden="true" />
              For sale ({saleCount.pending || saleCount.failed ? "—" : saleCount.count})
            </button>
            <button aria-pressed={bids} onClick={() => setBook("bids")}>
              <HandCoins size={15} aria-hidden="true" />
              Purchase bids ({bidCount.pending || bidCount.failed ? "—" : bidCount.count})
            </button>
          </div>
        </div>
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
        <MarketToolbar
          count={loading || unavailable ? undefined : filtered.length}
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
        {loading || !filtered.length ? (
          <div className="market-empty" role="status">
            {loading
                ? <span className="market-loading"><LoaderCircle size={16} aria-hidden="true" /><span>{source === "arkiv" ? "Loading orders from Arkiv…" : "Loading orders from Graph…"}</span></span>
                : unavailable
                  ? <button className="market-secondary" disabled={fetching} onClick={refresh}>{fetching ? "Retrying…" : "Retry"}</button>
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
        <ArkivSource source={source} onChange={setSource} onReload={reloadSource} useCache={useCache} onCacheChange={onCacheChange} />
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

function collectOrders(queries: Array<{ data?: { pages: Array<{ orders: SaleRow[] }> } }>) {
  return [...new Map(queries.flatMap((query) => (query.data?.pages ?? []).flatMap((page) => page.orders)).map((row) => [row.hash, row])).values()];
}
