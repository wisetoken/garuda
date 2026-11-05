import { createContext, useContext, type ReactNode } from "react";
import { X, ArrowUpRight } from "lucide-react";
import { ethereum } from "thirdweb/chains";
import type { SalesStep } from "../lib/blend/sales-wallet";
import type { MarketIntent } from "../lib/market/types";
import { useMarketController } from "../lib/market/useMarketController";
import { SaleForm } from "./market/SaleForm";
import "./market.css";
import "./market/sale-dialog.css";
type MarketContextValue = {
  open: (intent: MarketIntent) => void;
  busy: boolean;
  revision: number;
};
const MarketContext = createContext<MarketContextValue>({
  open: () => {},
  busy: false,
  revision: 0,
});
export const useMarketActions = () => useContext(MarketContext);
const labels: Record<SalesStep, string> = {
  checking: "Checking ownership and order state…",
  "approving-nft": "Approve this NFT in your wallet…",
  "approving-wise": "Approve the exact WISE amount in your wallet…",
  signing: "Review and sign the order in your wallet…",
  publishing: "Publishing your signed order…",
  confirming:
    "Waiting for Ethereum confirmations. This can take several minutes.",
  settling: "Confirm the stake transfer in your wallet…",
  cancelling: "Confirm cancellation in your wallet…",
};
export function MarketActionsProvider({ children }: { children: ReactNode }) {
  const {
    intent,
    setIntent,
    busy,
    step,
    error,
    setError,
    notice,
    setNotice,
    revision,
    pending,
    unsaved,
    dialog,
    open,
    execute,
    checkPending,
    connect,
    wallet,
    chain,
  } = useMarketController();
  return (
    <MarketContext.Provider value={{ open, busy, revision }}>
      {children}
      {unsaved && !busy && !intent && (
        <div className="market-notice" role="status">
          <span>A signed order needs review.</span>
          <button onClick={() => open({ kind: "cancel", row: unsaved })}>
            Review cancellation
          </button>
        </div>
      )}
      {notice && (
        <div className="market-notice" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {pending && !pending.confirmed && !intent && (
        <div className="market-notice" role="status">
          <a
            href={`https://etherscan.io/tx/${pending.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {pending.kind}: view transaction ↗
          </a>
          <button onClick={() => void checkPending()}>
            Check confirmation
          </button>
        </div>
      )}
      {intent && (
        <dialog
          ref={dialog}
          className="sale-dialog"
          aria-labelledby="sale-title"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) setIntent(null);
          }}
        >
          <button
            className="sale-close"
            aria-label="Close dialog"
            disabled={busy}
            onClick={() => setIntent(null)}
          >
            <X size={20} />
          </button>
          <SaleForm
            key={
              "position" in intent
                ? `${intent.kind}:${intent.position.collection}:${intent.position.tokenId}`
                : `${intent.kind}:${intent.row.order.nonce}`
            }
            intent={intent}
            busy={busy}
            status={busy ? labels[step] : ""}
            error={error}
            blocked={
              (!!pending && !pending.confirmed) ||
              (!!unsaved && intent.kind !== "cancel")
            }
            execute={execute}
            connect={connect}
            switchChain={async () => {
              try {
                await wallet?.switchChain(ethereum);
              } catch {
                setError("Network switch was not completed.");
              }
            }}
            correctChain={chain?.id === 1}
            onBid={(position) => open({ kind: "bid", position })}
          />
          {pending && (
            <p className="sale-tx">
              <a
                href={`https://etherscan.io/tx/${pending.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                {pending.kind} {pending.confirmed ? "confirmed" : "submitted"}{" "}
                <ArrowUpRight size={14} />
              </a>
              {!pending.confirmed && !busy && (
                <button onClick={() => void checkPending()}>
                  Check confirmation
                </button>
              )}
            </p>
          )}
          {unsaved && !busy && intent.kind !== "cancel" && (
            <div className="sale-note">
              <p>
                Your signature may still be valid. Cancel it onchain before
                signing another order.
              </p>
              <button
                className="market-secondary"
                onClick={() => open({ kind: "cancel", row: unsaved })}
              >
                Review cancellation
              </button>
            </div>
          )}
        </dialog>
      )}
    </MarketContext.Provider>
  );
}
