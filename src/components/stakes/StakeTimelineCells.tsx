import { ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { SignaturePosition } from "../../lib/blend/live-portfolio";
import { STAKE_COLLECTIONS } from "../../lib/blend/stake-collections";
import { loadStakeCreationTx, validCreationHash } from "../../lib/blend/stake-creation-tx";
import { stakeTimeline } from "../../lib/blend/stake-art";
import { marketDate } from "../../lib/market/presentation";
import { stakeCreatedAt, stakeName } from "../../lib/stakes/table";
import { ethereumClient } from "../../lib/portfolio";

export function StakeCreatedCell({ position }: { position: SignaturePosition }) {
  const collection = position.collection ?? STAKE_COLLECTIONS.signature.address;
  const knownHash = validCreationHash(position.displayStake?.createdAtTransactionHash);
  const { data } = useQuery({
    queryKey: ["stake-creation", collection, position.stakeId],
    queryFn: () => loadStakeCreationTx(ethereumClient, position.stakeId, collection),
    enabled: !knownHash,
    staleTime: Infinity,
  });
  const hash = knownHash ?? validCreationHash(data);
  const created = stakeCreatedAt(position);
  const days = Math.max(0, Math.floor(((position.observedAt ?? Date.now() / 1000) - created) / 86400));
  return <>
    {days === 0 ? "Today" : `${days.toLocaleString("en-US")} ${days === 1 ? "Day" : "Days"} Ago`}
    <small className="stake-table-date">
      <time dateTime={new Date(created * 1000).toISOString()}>On {marketDate(created)}</time>
      {hash && <a href={`https://etherscan.io/tx/${hash}`} target="_blank" rel="noopener noreferrer"
        aria-label={`View ${stakeName(position)} creation transaction on Etherscan (opens in a new tab)`}
        title="View creation transaction on Etherscan"><ArrowUpRight size={13} aria-hidden="true" /></a>}
    </small>
  </>;
}

export function StakeProgressCell({ position }: { position: SignaturePosition }) {
  const { status, progress } = stakeTimeline(position);
  const percent = Number((progress * 100).toFixed(2));
  const days = Math.max(0, Math.round((position.maturesAt - position.startAt) / 86400));
  const label = status === "Pending" ? "Not started" : `${percent}% ${status === "Mature" ? "Completed" : "Matured"}`;
  return <>
    <div className="stake-table-progress" data-status={status} role="progressbar"
      aria-label={`${stakeName(position)} maturity progress`} aria-valuenow={percent}
      aria-valuemin={0} aria-valuemax={100} aria-valuetext={label}>
      <span className={status === "Active" ? "progress-fill-sweep-ltr" : undefined}
        style={{ width: `${progress * 100}%` }} />
    </div>
    <small className="stake-table-progress-label"><span>{label}</span><span>{days.toLocaleString("en-US")} {days === 1 ? "Day" : "Days"} Total</span></small>
  </>;
}
