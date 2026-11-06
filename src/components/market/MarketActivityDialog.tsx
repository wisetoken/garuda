import { useEffect, useId, useRef } from "react";
import { History, RefreshCw, X } from "lucide-react";
import type { MarketBook } from "../../lib/market/api";
import { MarketActivity } from "./MarketActivity";
import "./market-activity.css";

type Props = {
  books: MarketBook[];
  loading: boolean;
  unavailable: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
};

export function MarketActivityDialog({ books, loading, unavailable, refreshing, onRefresh, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(), descriptionId = useId();
  const backdropPress = useRef(false);
  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : document.querySelector<HTMLButtonElement>('button[aria-label="Market activity"]');
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={dialog} className="market-activity-dialog"
      aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onPointerDown={(event) => { backdropPress.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (!backdropPress.current || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <header className="market-activity-heading">
        <div>
          <h2 id={titleId}><History size={22} aria-hidden="true" />Market activity</h2>
          <p id={descriptionId}>Recent confirmed marketplace transactions on Ethereum.</p>
        </div>
        <div className="market-activity-actions">
          <button type="button" className="market-settings-button" aria-label="Refresh activity"
            disabled={refreshing} onClick={onRefresh}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button type="button" className="market-settings-button" aria-label="Close activity" autoFocus onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="market-activity-content" aria-busy={loading}>
        {unavailable && !books.some(book => book.activity?.length) && !loading ? (
          <div className="market-empty">
            <button type="button" className="market-secondary" disabled={refreshing} onClick={onRefresh}>
              {refreshing ? "Refreshing…" : "Retry activity"}
            </button>
          </div>
        ) : <MarketActivity books={books} loading={loading} />}
      </div>
    </dialog>
  );
}
