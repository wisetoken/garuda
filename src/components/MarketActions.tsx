import { createContext, useContext, type ReactNode } from "react";
import { X, ArrowUpRight } from "lucide-react";
import { ethereum } from "thirdweb/chains";
import type { SalesStep } from "../lib/blend/sales-wallet";
import type { MarketIntent } from "../lib/market/types";
import { useMarketController } from "../lib/market/useMarketController";
import { SaleForm } from "./market/SaleForm";
import "./market.css";
import "./market/sale-dialog.css";
import "./market/sale-loading.css";
import { useAppToast } from "./AppToast";
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
  checking: "Checking…",
  "approving-nft": "Approve NFT in your wallet…",
  "approving-wise": "Approve WISE in your wallet…",
  signing: "Sign order in your wallet…",
  publishing: "Publishing…",
  confirming: "Waiting for confirmation…",
  settling: "Confirm transfer in your wallet…",
  cancelling: "Confirm cancellation in your wallet…",
};
export function MarketActionsProvider({ children }: { children: ReactNode }) {
  const { showToast } = useAppToast();
  const {
    intent,
    setIntent,
    busy,
    step,
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
            busyLabel={labels[step]}
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
                showToast("Network switch was not completed. Please try again.", { tone: "error" });
              }
            }}
            correctChain={chain?.id === 1}
            onBid={(position) => open({ kind: "bid", position })}
          />
          {pending && !(pending.confirmed && ["WISE approval", "NFT approval"].includes(pending.kind)) && (
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
