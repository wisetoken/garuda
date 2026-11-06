import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveAccount } from "thirdweb/react";
import { X } from "lucide-react";
import { marketApi } from "../../lib/market/api";
import { extendOfferMessage } from "../../lib/market/arkiv-extension";
import { stakeCollection } from "../../lib/blend/stake-collections";
import type { SaleRow } from "../../lib/blend/sales";
import { useAppToast } from "../AppToast";
import "./market-activity.css";
import "./extend-offer.css";

const utc = (seconds: number) => new Date(seconds * 1000).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC";

export function ExtendOfferDialog({ row, entity, onClose }: { row: SaleRow; entity: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
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
  return <dialog ref={dialog} className="market-activity-dialog extend-offer-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="market-activity-heading">
      <div><h2 id={titleId}>Extend offer storage</h2><p>{collection.name} Stake #{row.order.tokenId} · {row.order.kind === 1 ? "Purchase bid" : "Sale listing"}</p></div>
      <button type="button" className="market-secondary" aria-label="Close extension" disabled={busy} onClick={onClose}><X size={20} /></button>
    </header>
    <div className="extend-offer-content">
      <p>Keep this offer discoverable on Arkiv for longer. This does not change how long the signed offer can be accepted.</p>
      <dl>
        <div><dt>Trading deadline</dt><dd>{utc(Number(row.order.deadline))}</dd></div>
        <div><dt>Current Arkiv storage expiry</dt><dd>{lifetime.data ? `Block ${lifetime.data.expiresBlock}` : lifetime.isError ? <button className="market-secondary" onClick={() => void lifetime.refetch()}>Retry expiry lookup</button> : "Loading…"}</dd></div>
      </dl>
      <a href={`https://rabdi.explorer.arkiv.network/entity/${entity}`} target="_blank" rel="noopener noreferrer">View live storage lifetime on Arkiv</a>
      <fieldset disabled={busy}><legend>Keep stored for at least</legend>
        <div className="extend-offer-durations">{[7,30,90].map(value => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value} days</button>)}</div>
      </fieldset>
      <dl><div><dt>Storage target · from now</dt><dd>{utc(target)}</dd></div></dl>
      <p className="market-muted">Arkiv expiry is measured in blocks. The date is a target; existing storage will not be shortened. After the trading deadline, the stored offer cannot be accepted. A later trading deadline requires a new signed offer.</p>
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" className="market-secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="market-primary" disabled={busy || !account || !lifetime.data} onClick={() => void confirm()}>{busy ? "Extending…" : "Sign and extend storage"}</button></footer>
    </div>
  </dialog>;
}
