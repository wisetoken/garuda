import { useMarketActions } from "../components/MarketActions";
import { useState } from "react";
import { ArrowDownUp, LayoutGrid, List, Wallet } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import { GarudaPageKicker } from "../components/GarudaPageKicker";
import { StakeCard } from "../components/StakeCard";
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
import { useWalletAccess } from "../lib/wallet";
import "./my-stakes.css";

export function MyStakesPage() {
  const { open, busy } = useMarketActions();
  const [view, setView] = useState<"cards" | "table">("cards");
  const account = useActiveAccount(),
    { connect, connecting } = useWalletAccess();
  const portfolio = usePortfolio(),
    { data: price } = useWiseUsd();
  const positions = [...(portfolio.data?.positions ?? [])].sort(
    (a, b) => b.startAt - a.startAt,
  );
  return (
    <>
      <title>My stakes | WiseOne | Garuda Extension</title>
      <div className="stakes-page-heading">
        <GarudaPageKicker
          label="YOUR POSITIONS"
          description="Choose the position you want to use. Its ownership stays in your wallet until a trade settles."
        />
        <div className="stakes-title-row">
          <h1>Start with your stake.</h1>
          <div
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
          </div>
        </div>
      </div>
      {!account ? (
        <div className="state-panel">
          <Wallet size={28} />
          <h2>Your stakes, in one place.</h2>
          <p>Connect your wallet to see your Signature and Advanced stakes.</p>
          <button
            className="stake-primary"
            onClick={() => void connect()}
            disabled={connecting}
          >
            Connect wallet
          </button>
        </div>
      ) : (
        <>
          {portfolio.isError && (
            <div className="state-message" role="alert">
              Could not refresh your stakes.{" "}
              <button onClick={() => void portfolio.refetch()}>
                Try again
              </button>
            </div>
          )}
          {portfolio.isPending ? (
            <div className="state-panel" role="status">
              Reading your stakes from Ethereum…
            </div>
          ) : !portfolio.isError && !positions.length ? (
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
                  onList={() => open({ kind: "list", position })}
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
                    const name = `${stakeCollection(position.collection ?? STAKE_COLLECTIONS.signature.address).name} #${position.tokenId}`,
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
                            disabled={busy || !position.canList}
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
