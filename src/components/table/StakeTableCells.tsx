import { ArrowLeftRight, CircleCheck, Clock3 } from "lucide-react";
import type { SignaturePosition } from "../../lib/blend/live-portfolio";
import { stakeTimeline, stakeYield } from "../../lib/blend/stake-art";
import { marketWise, marketUsd, marketDate, statusLabel, daysServed } from "../../lib/market/presentation";

type PositionProps = { position?: SignaturePosition };
type ValueProps = PositionProps & { usd?: number };

export function StakeTypeCell({ label, status }: {
  label: string;
  status?: SignaturePosition["status"];
}) {
  return <span className="stake-type market-type" data-status={status} tabIndex={0} aria-label={label}>
    <ArrowLeftRight size={14} aria-hidden="true" /><span role="tooltip">{label}</span>
  </span>;
}

export function StakeStatusCell({ position }: PositionProps) {
  const status = position ? stakeTimeline(position).status : undefined;
  return <>
    <span className="market-status" data-status={status}>
      {status === "Mature" ? <CircleCheck size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}
      {position ? statusLabel(position) : "Checking…"}
    </span>
    {position && <small>{status === "Mature" || status === "Closed" ? "On" : "Till"} {marketDate(position.maturesAt)}</small>}
  </>;
}

export function StakeAmountCell({ position, usd }: ValueProps) {
  return <>{position ? `${marketWise(position.principal, true)} WISE` : "—"}
    <small>{marketUsd(position?.principal, usd)}</small></>;
}

export function StakeYieldCell({ position }: PositionProps) {
  const value = position ? stakeYield(position) : null;
  return <>
    <span className="market-yield" data-mature={position && stakeTimeline(position).status === "Mature"}
      title="Simple annualized yield, based on past accrued interest. Future returns may vary.">
      {value === null ? "—" : `${value.toFixed(2)}%`}
    </span>
    <small>{position ? daysServed(position) : "—"}</small>
  </>;
}

export function StakeRewardCell({ position, usd }: ValueProps) {
  return <>
    <span className="market-yield">{position?.unclaimedInterest === undefined ? "—" : `+${marketWise(position.unclaimedInterest)} WISE`}</span>
    <small>{position?.unclaimedInterest !== undefined && usd ? "+" : ""}{marketUsd(position?.unclaimedInterest, usd)}</small>
  </>;
}
