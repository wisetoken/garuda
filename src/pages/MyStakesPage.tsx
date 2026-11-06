import { useErrorToast } from "../components/AppToast";
import { useMarketActions } from "../components/MarketActions";
import { useState } from "react";
import { ArrowDownUp, LayoutGrid, List } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import { GarudaPageKicker } from "../components/GarudaPageKicker";
import { StakeCard } from "../components/StakeCard";
import { WalletWelcome } from "../components/WalletWelcome";
import {
  usePortfolio,
  useWiseUsd,
  wiseAmount,
  usdAmount,
} from "../lib/portfolio";
import { stakeDate, stakeTimeline, stakeYield } from "../lib/blend/stake-art";
import {
  stakeCollection,
  STAKE_COLLECTIONS,
} from "../lib/blend/stake-collections";
import "./my-stakes.css";

export function MyStakesPage({ embedded = false }: { embedded?: boolean }) {
  const { open, busy } = useMarketActions();
  const [view, setView] = useState<"cards" | "table">("cards");
  const account = useActiveAccount();
  const portfolio = usePortfolio(),
    { data: price } = useWiseUsd();
  const positions = [...(portfolio.data?.positions ?? [])].sort(
    (a, b) => b.startAt - a.startAt,
  );
  useErrorToast("portfolio", portfolio.isError && !portfolio.isFetching && "Could not refresh your stakes. Please try again.", () => void portfolio.refetch());
  const actionsBlocked = busy || portfolio.isFetching || portfolio.isError;
  return (
    <>
      {!embedded && <title>My stakes | WiseOne | Garuda Extension</title>}
      <div
        className={
          embedded ? "market-portfolio-toolbar" : "stakes-page-heading"
        }
      >
        {!embedded && (
          <GarudaPageKicker
            label="YOUR POSITIONS"
            description="Choose the position you want to use. Its ownership stays in your wallet until a trade settles."
          />
        )}
        <div className="stakes-title-row">
          {embedded ? (
            <strong>Your NFT stakes{account ? ` (${positions.length})` : ""}</strong>
          ) : (
            <h1>Start with your stake.</h1>
          )}
          {account && <div
            className="stake-view-switch"
            role="group"
            aria-label="Stake view"
          >
            <button
              aria-pressed={view === "cards"}
              onClick={() => setView("cards")}
            >
              <LayoutGrid size={15} aria-hidden="true" />
              Cards
            </button>
            <button
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
            >
              <List size={15} aria-hidden="true" />
              Table
            </button>
          </div>}
        </div>
      </div>
      {!account ? (
        <WalletWelcome />
      ) : (
        <>
          {portfolio.isPending ? (
            <div className="state-panel" role="status">
              Reading your stakes from Ethereum…
            </div>
          ) : portfolio.isError && !positions.length ? (
            <div className="state-panel"><button className="market-secondary" disabled={portfolio.isFetching} onClick={() => void portfolio.refetch()}>{portfolio.isFetching ? "Refreshing…" : "Refresh stakes"}</button></div>
          ) : !positions.length ? (
            <div className="state-panel">
              <h2>No NFT stakes in this wallet.</h2>
              <p>Your Signature and Advanced positions will appear here.</p>
            </div>
          ) : view === "cards" ? (
            <div className="stakes-grid">
              {positions.map((position) => (
                <StakeCard
                  key={`${position.collection}:${position.tokenId}`}
                  position={position}
                  onList={actionsBlocked ? undefined : () => open({ kind: "list", position })}
                />
              ))}
            </div>
          ) : (
            <div className="stakes-table-wrap">
              <table className="stakes-table">
                <caption className="sr-only">
                  Your NFT stakes, newest first
                </caption>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Stake created ↓</th>
                    <th>Maturity progress</th>
                    <th>Status</th>
                    <th>Amount staked</th>
                    <th>Annualized yield*</th>
                    <th>Unclaimed interest</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => {
                    const name = `${stakeCollection(position.collection ?? STAKE_COLLECTIONS.signature.address).name} Stake #${position.tokenId}`,
                      timeline = stakeTimeline(position),
                      yieldValue = stakeYield(position);
                    return (
                      <tr key={`${position.collection}:${position.tokenId}`}>
                        <td>
                          <span
                            className="stake-type"
                            tabIndex={0}
                            aria-label={name}
                          >
                            <ArrowDownUp size={18} aria-hidden="true" />
                            <span role="tooltip">{name}</span>
                          </span>
                        </td>
                        <td>{stakeDate(position.startAt)}</td>
                        <td>
                          <div
                            className="table-progress"
                            role="progressbar"
                            aria-label={`${name} term elapsed`}
                            aria-valuenow={Math.round(timeline.progress * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span
                              style={{ width: `${timeline.progress * 100}%` }}
                            />
                          </div>
                          <small>
                            {Math.round(timeline.progress * 100)}% elapsed
                          </small>
                        </td>
                        <td>
                          {timeline.status}
                          <small>{stakeDate(position.maturesAt)}</small>
                        </td>
                        <td>
                          {wiseAmount(position.principal)} WISE
                          <small>{usdAmount(position.principal, price)}</small>
                        </td>
                        <td>
                          {yieldValue?.toFixed(2) ?? "—"}%
                          <small>Simple, historical</small>
                        </td>
                        <td>
                          {wiseAmount(position.unclaimedInterest)} WISE
                          <small>
                            {usdAmount(position.unclaimedInterest, price)}
                          </small>
                        </td>
                        <td>
                          <button
                            className="market-primary"
                            disabled={actionsBlocked || !position.canList}
                            onClick={() => open({ kind: "list", position })}
                          >
                            List for sale
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
