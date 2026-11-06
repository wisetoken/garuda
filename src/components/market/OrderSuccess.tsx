import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, CheckCircle2, Copy, ExternalLink, LoaderCircle } from "lucide-react";
import type confetti from "canvas-confetti";
import { formatAmount } from "../../lib/blend/domain";
import { stakeCollection } from "../../lib/blend/stake-collections";
import { marketApi } from "../../lib/market/api";
import { readPublication, type OrderSuccess as Receipt } from "../../lib/market/success";
import "./order-success.css";

const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

export function OrderSuccess({ receipt, onClose, onView }: {
  receipt: Receipt; onClose: () => void; onView: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false);
  const meta = stakeCollection(receipt.order.collection), bid = receipt.order.kind === 1;
  const publication = useQuery({
    queryKey:["market-publication",meta.id,receipt.hash],
    queryFn:async()=>readPublication(await marketApi(meta.id,`arkiv/status/${receipt.hash}`),receipt.hash),
    refetchInterval:query => ["published","unavailable"].includes(query.state.data?.state ?? "") ? false : 5_000,
    staleTime:0, retry:1,
  });
  useEffect(() => {
    heading.current?.focus();
    let disposed = false, burst: confetti.CreateTypes | undefined;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void import("canvas-confetti").then(({ default: confetti }) => {
        if (disposed || !canvas.current) return;
        burst = confetti.create(canvas.current,{resize:true});
        const base = {origin:{x:0.5,y:0.7},colors:["#00b0aa","#4ade80","#7b5ea7","#ffffff"],disableForReducedMotion:true};
        const fire = (ratio:number,opts:confetti.Options) => burst!({...base,...opts,particleCount:Math.floor(200*ratio)});
        // Same layered celebration used by WiseOne's staking success dialogs.
        fire(.25,{spread:26,startVelocity:55}); fire(.2,{spread:60});
        fire(.35,{spread:100,decay:.91,scalar:.8});
        fire(.1,{spread:120,startVelocity:25,decay:.92,scalar:1.2}); fire(.1,{spread:120,startVelocity:45});
      }).catch(() => { /* Receipt remains usable if the animation cannot load. */ });
    }
    return () => { disposed=true; burst?.reset(); };
  }, [receipt.hash]);
  const state = publication.data?.state;
  const publishing = !publication.isError && state !== "published" && state !== "unavailable";
  return <>
    <canvas ref={canvas} className="order-success-confetti" aria-hidden="true" />
    <section className="order-success">
      <div className="order-success-icon"><CheckCircle2 size={36} aria-hidden="true" /></div>
      <h2 id="sale-title" ref={heading} tabIndex={-1}>{bid ? "Bid placed!" : "Stake listed!"}</h2>
      <p className="order-success-description">{bid ? "Your signed bid has been saved." : "Your signed listing has been saved."}</p>
      <div className="order-success-summary">
        <p>{meta.name} Stake #{receipt.order.tokenId}</p>
        <strong>{formatAmount(BigInt(receipt.order.amount), 18)} WISE</strong>
        <span>{bid ? "Your bid" : "Asking price"}</span>
        <dl><div><dt>Expires / UTC</dt><dd>{new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"}).format(Number(receipt.order.deadline)*1000)}</dd></div></dl>
      </div>
      <div className="order-success-publication" role="status">
        {publishing && <LoaderCircle size={16} className="sale-loading" aria-hidden="true" />}
        <span>{publication.isError ? "Order saved. Arkiv status is temporarily unavailable." : state === "published" ? "Published on Arkiv" : state === "unavailable" ? "Order saved. Arkiv publication is no longer available." : state === "retrying" ? "Order saved. Arkiv publication will retry automatically." : "Publishing to Arkiv…"}</span>
        {publication.isError && <button type="button" disabled={publication.isFetching} onClick={()=>void publication.refetch()}>Check again</button>}
      </div>
      <dl className="order-success-receipt">
        <div><dt>Order hash</dt><dd><code title={receipt.hash}>{shortHash(receipt.hash)}</code><button type="button" aria-label="Copy order hash" onClick={async()=>{
          try {await navigator.clipboard.writeText(receipt.hash);setCopied(true);setCopyError(false);} catch {setCopyError(true);}
        }}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></dd></div>
        {publication.data?.entityKey && <div><dt>Arkiv record</dt><dd><a href={`https://rabdi.explorer.arkiv.network/entity/${publication.data.entityKey}`} target="_blank" rel="noopener noreferrer" title={publication.data.entityKey}>{shortHash(publication.data.entityKey)}<ExternalLink size={14} /></a></dd></div>}
        {publication.data?.txHash && <div><dt>Arkiv transaction</dt><dd><a href={`https://rabdi.explorer.arkiv.network/tx/${publication.data.txHash}`} target="_blank" rel="noopener noreferrer" title={publication.data.txHash}>{shortHash(publication.data.txHash)}<ExternalLink size={14} /></a></dd></div>}
      </dl>
      {copyError && <p role="status" className="order-success-copy-error">Copy unavailable. Order hash: <code>{receipt.hash}</code></p>}
      <p className="order-success-next">{bid ? "The owner can accept your bid before it expires. Keep enough WISE in your wallet." : "Your stake stays in your wallet until a buyer completes the purchase."}</p>
      <div className="order-success-actions">
        <button type="button" className="stake-primary" onClick={onView}>{bid ? "View purchase bids" : "View listings"}</button>
        <button type="button" className="market-secondary" onClick={onClose}>Done</button>
      </div>
    </section>
  </>;
}
