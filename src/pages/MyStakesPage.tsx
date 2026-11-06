import { useErrorToast } from "../components/AppToast";
import { useMarketActions } from "../components/MarketActions";
import { useState } from "react";
import { LayoutGrid, List, LoaderCircle } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import { GarudaPageKicker } from "../components/GarudaPageKicker";
import { StakeCard } from "../components/StakeCard";
import { WalletWelcome } from "../components/WalletWelcome";
import { usePortfolio } from "../lib/portfolio";
import { StakesTable } from "../components/stakes/StakesTable";
import { sortStakes } from "../lib/stakes/table";
import "./my-stakes.css";

export function MyStakesPage({ embedded = false }: { embedded?: boolean }) {
  const { open, busy } = useMarketActions();
  const [view, setView] = useState<"cards" | "table">("cards");
  const account = useActiveAccount();
  const portfolio = usePortfolio();
  const positions = sortStakes(portfolio.data?.positions ?? [], "created", "desc");
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
            <div className="stakes-loading" role="status" aria-live="polite">
              <span><LoaderCircle size={16} aria-hidden="true" />Loading your stakes…</span>
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
            <StakesTable positions={positions} actionsBlocked={actionsBlocked}
              onList={(position) => open({ kind: "list", position })}
              onRefresh={() => void portfolio.refetch()} refreshing={portfolio.isFetching} />
          )}
        </>
      )}
    </>
  );
}
