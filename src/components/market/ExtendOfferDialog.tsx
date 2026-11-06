import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useActiveAccount } from "thirdweb/react";
import { ExternalLink, Info, LoaderCircle, X } from "lucide-react";
import { marketApi } from "../../lib/market/api";
import { extendOfferMessage } from "../../lib/market/arkiv-extension";
import { stakeCollection } from "../../lib/blend/stake-collections";
import type { SaleRow } from "../../lib/blend/sales";
import { useAppToast } from "../AppToast";
import "./market-activity.css";
import "./extend-offer.css";

const utc = (seconds: number) => new Date(seconds * 1000).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC";

export function ExtendOfferDialog({ row, entity, onClose }: { row: SaleRow; entity: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId(), descriptionId = useId();
  const account = useActiveAccount(), { showToast } = useAppToast();
  const [days, setDays] = useState(30), [openedAt] = useState(() => Math.floor(Date.now()/1000));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const collection = stakeCollection(row.order.collection);
  const target = openedAt + days * 86400;
  const lifetime = useQuery({
    queryKey: ["arkiv-lifetime", row.hash, entity],
    queryFn: () => marketApi<{ expiresBlock: string }>(collection.id, `arkiv/${row.hash}/lifetime?entityKey=${entity}`),
    staleTime: 0, retry: 1,
  });
  useEffect(() => {
    const el = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    el.showModal(); document.body.style.overflow = "hidden";
    return () => { el.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); };
  }, []);
  async function confirm() {
    if (!account || busy) return;
    setBusy(true); setError("");
    try {
      const signature = await account.signMessage({ message: extendOfferMessage(row.hash, entity, target) });
      await marketApi(collection.id, `arkiv/${row.hash}/extend`, { entityKey: entity, signature, expiresAt: target });
      await lifetime.refetch();
      showToast(`Arkiv storage extended until at least ${utc(target)}. The trading deadline is unchanged.`);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not extend storage. Please try again."); }
    finally { setBusy(false); }
  }
  return createPortal(
    <dialog ref={dialog} className="market-activity-dialog extend-offer-dialog"
      aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
      <header className="extend-offer-heading">
        <div>
          <h2 id={titleId}>Extend offer storage</h2>
          <p>{collection.name} Stake #{row.order.tokenId}<span>{row.order.kind === 1 ? "Purchase bid" : "Sale listing"}</span></p>
        </div>
        <button type="button" className="extend-offer-close" aria-label="Close extension" disabled={busy} onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>

      <div className="extend-offer-content">
        <p id={descriptionId} className="extend-offer-intro">Keep the offer’s record on Arkiv for longer.</p>
        <dl className="extend-offer-summary">
          <div>
            <dt>Trading deadline <span>Unchanged</span></dt>
            <dd>{utc(Number(row.order.deadline))}</dd>
          </div>
          <div>
            <dt>Current storage expiry</dt>
            <dd>{lifetime.data ? (
              <a href={`https://rabdi.explorer.arkiv.network/entity/${entity}`} target="_blank" rel="noopener noreferrer" aria-label={`View Arkiv storage expiry at block ${lifetime.data.expiresBlock}`}>
                Block {BigInt(lifetime.data.expiresBlock).toLocaleString("en-US")}<ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : lifetime.isError ? (
              <button type="button" className="extend-offer-retry" onClick={() => void lifetime.refetch()}>Retry expiry lookup</button>
            ) : <span className="extend-offer-loading" role="status"><LoaderCircle size={14} className="sale-loading" aria-hidden="true" />Loading expiry…</span>}</dd>
          </div>
        </dl>

        <fieldset className="extend-offer-choice" disabled={busy}>
          <legend>Keep stored for at least</legend>
          <div className="extend-offer-durations">{[7, 30, 90].map(value => (
            <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value} days</button>
          ))}</div>
        </fieldset>
        <div className="extend-offer-target" aria-live="polite" aria-atomic="true">
          <span>Storage target</span><strong>{utc(target)}</strong>
        </div>
        <p className="extend-offer-storage-note">From now. Existing storage won’t be shortened; the exact expiry is set in Arkiv blocks.</p>

        <aside className="extend-offer-notice">
          <Info size={17} aria-hidden="true" />
          <p><strong>The trading deadline stays the same.</strong>A later trading deadline requires a new offer signed by its maker.</p>
        </aside>
        {error && <p className="extend-offer-error" role="alert">{error}</p>}
      </div>

      <footer className="extend-offer-actions">
        <button type="button" className="market-secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="market-primary" disabled={busy || !account || !lifetime.data} onClick={() => void confirm()}>
          {busy && <LoaderCircle size={16} className="sale-loading" aria-hidden="true" />}
          {busy ? "Extending…" : "Sign & extend storage"}
        </button>
      </footer>
    </dialog>,
    document.querySelector(".app-shell") ?? document.body,
  );
}
