import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, LoaderCircle } from "lucide-react";
import { formatAmount } from "../../lib/blend/domain";
import { stakeCollection } from "../../lib/blend/stake-collections";
import { marketApi } from "../../lib/market/api";
import { readPublication, type OrderSuccess as Receipt } from "../../lib/market/success";
import { SuccessFrame } from "./SuccessFrame";

const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

export function OrderSuccess({ receipt, onClose, onView }: {
  receipt: Receipt; onClose: () => void; onView: () => void;
}) {
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false);
  const meta = stakeCollection(receipt.order.collection), bid = receipt.order.kind === 1;
  const publication = useQuery({
    queryKey:["market-publication",meta.id,receipt.hash],
    queryFn:async()=>readPublication(await marketApi(meta.id,`arkiv/status/${receipt.hash}`),receipt.hash),
    refetchInterval:query => ["published","unavailable"].includes(query.state.data?.state ?? "") ? false : 5_000,
    staleTime:0, retry:1,
  });
  const state = publication.data?.state;
  const publishing = !publication.isError && state !== "published" && state !== "unavailable";
  return <SuccessFrame
    receiptKey={receipt.hash}
    title={bid ? "Bid placed!" : "Stake listed!"}
    description={bid ? "Your signed bid has been saved." : "Your signed listing has been saved."}
    next={bid ? "The owner can accept your bid before it expires. Keep enough WISE in your wallet." : "Your stake stays in your wallet until a buyer completes the purchase."}
    viewLabel={bid ? "View purchase bids" : "View listings"}
    onClose={onClose} onView={onView}
  >
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
  </SuccessFrame>;
}
