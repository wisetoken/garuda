import { useState } from "react";
import { Link } from "react-router-dom";
import { useActiveAccount } from "thirdweb/react";
import { LayoutGrid, List, Plus, RefreshCw } from "lucide-react";
import { GarudaPageKicker } from "../components/GarudaPageKicker";
import { OrderRow, OrderCard } from "../components/market/OrderViews";
import { SavedOrders } from "../components/market/SavedOrders";
import { useMarkets, orderAvailable } from "../lib/market/api";
import { useBook } from "../lib/market/queries";
import { type SalesDeployment, sameAddress } from "../lib/blend/sales";
import { stakeCollection } from "../lib/blend/stake-collections";
import "../components/market.css";

export function MarketPage() {
  const markets = useMarkets(),
    account = useActiveAccount();
  const deployments = markets.map((query) =>
    query.data?.enabled ? query.data.deployment : undefined,
  );
  const signature = useBook("signature", deployments[0]),
    advanced = useBook("advanced", deployments[1]);
  const [view, setView] = useState<"table" | "cards">("table"),
    [book, setBook] = useState<"listings" | "bids" | "mine">("listings"),
    [search, setSearch] = useState(""),
    [showInactive, setShowInactive] = useState(false);
  const rows = [
    ...(signature.data?.pages.flatMap((page) => page.orders) ?? []),
    ...(advanced.data?.pages.flatMap((page) => page.orders) ?? []),
  ];
  const filtered = Array.from(
    new Map(rows.map((row) => [row.hash, row])).values(),
  )
    .filter(
      (row) =>
        (book === "mine"
          ? !!account && sameAddress(account.address, row.order.maker)
          : row.order.kind === (book === "bids" ? 1 : 0)) &&
        (showInactive ||
          book === "mine" ||
          orderAvailable(row) ||
          row.status === "checking") &&
        `${stakeCollection(row.order.collection).name} ${row.order.tokenId} ${row.order.owner} ${row.order.maker}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      BigInt(a.order.amount) < BigInt(b.order.amount)
        ? -1
        : BigInt(a.order.amount) > BigInt(b.order.amount)
          ? 1
          : 0,
    );
  const loading =
    markets.some((q) => q.isPending) ||
    deployments.some((d, i) => d && [signature, advanced][i].isPending);
  const unavailable =
    markets.some((q) => q.isError) || signature.isError || advanced.isError;
  const checking = [signature, advanced].some((q) =>
    q.data?.pages.some((page) => !page.verified),
  );
  function refresh() {
    markets.forEach((q) => void q.refetch());
    if (deployments[0]) void signature.refetch();
    if (deployments[1]) void advanced.refetch();
  }
  return (
    <>
      <title>Market | WiseOne | Garuda Extension</title>
      <div className="stakes-page-heading">
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
          <Link className="market-primary" to="/garuda/?screen=stakes">
            <Plus size={17} />
            List a stake
          </Link>
        </header>
        <div className="market-tabs" role="group" aria-label="Order book">
          {(
            [
              ["listings", "For sale"],
              ["bids", "Purchase bids"],
              ["mine", "My orders"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={book === id}
              onClick={() => setBook(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="market-toolbar">
          <strong>
            {book === "mine" ? "Your orders" : "Market stakes"} (
            {filtered.length})
          </strong>
          <input
            aria-label="Search stakes or addresses"
            placeholder="Search stake or address"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="market-inactive">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
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
                <LayoutGrid size={15} />
                Cards
              </button>
              <button
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                <List size={15} />
                Table
              </button>
            </div>
            <button
              className="market-refresh"
              onClick={refresh}
              aria-label="Refresh market"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </div>
        {unavailable && (
          <p className="state-message" role="alert">
            Some market data could not be refreshed.{" "}
            <button onClick={refresh}>Retry</button>
          </p>
        )}
        {checking && (
          <p className="state-message" role="status">
            Showing the order catalog. Trading waits for current availability
            checks.
          </p>
        )}
        {!filtered.length ? (
          <div className="market-empty" role="status">
            {book === "mine" && !account
              ? "Connect your wallet to see your orders."
              : loading
                ? "Loading the market…"
                : unavailable
                  ? "Market data is temporarily unavailable."
                  : "No matching orders right now."}
          </div>
        ) : view === "table" ? (
          <div className="stakes-table-wrap">
            <table className="stakes-table market-table">
              <caption className="sr-only">
                {book === "bids" ? "Purchase bids" : "Stake orders"}
              </caption>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Owner</th>
                  {book === "bids" && <th>Bidder</th>}
                  <th>
                    {book === "bids"
                      ? "Bid price"
                      : book === "mine"
                        ? "Price"
                        : "Asking price"}{" "}
                    ↑
                  </th>
                  <th>Status</th>
                  <th>Amount staked</th>
                  <th>Stake APY*</th>
                  <th>Stake reward</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <OrderRow key={row.hash} row={row} bids={book === "bids"} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="stakes-grid market-grid">
            {filtered.map((row) => (
              <OrderCard key={row.hash} row={row} />
            ))}
          </div>
        )}
        {(signature.hasNextPage || advanced.hasNextPage) && (
          <div className="market-pagination">
            <button
              className="market-secondary"
              disabled={
                signature.isFetchingNextPage || advanced.isFetchingNextPage
              }
              onClick={() => {
                if (signature.hasNextPage) void signature.fetchNextPage();
                if (advanced.hasNextPage) void advanced.fetchNextPage();
              }}
            >
              Load more orders
            </button>
          </div>
        )}
      </section>
      <SavedOrders
        deployments={deployments.filter((d): d is SalesDeployment => !!d)}
      />
    </>
  );
}
