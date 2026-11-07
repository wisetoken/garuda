import type { ReactNode } from "react";
import type { WireSaleOrder } from "../../lib/blend/sales";
import type { SignaturePosition } from "../../lib/blend/live-portfolio";
import { stakeDate, stakeTimeline, stakeYield } from "../../lib/blend/stake-art";
import { interestAmount, usdAmount, wiseAmount, yieldPercent } from "../../lib/portfolio";

export function SaleStakeDetails({ name, tokenId, position, usd, fallback }: {
  name: string;
  tokenId: string;
  position?: SignaturePosition;
  usd?: number;
  fallback?: ReactNode;
}) {
  const timeline = position ? stakeTimeline(position) : undefined;
  const yieldValue = position ? stakeYield(position) : null;
  const observedAt = position?.observedAt ?? Date.now() / 1000;
  const elapsedDays = position ? Math.max(0, Math.floor((Math.min(observedAt, position.maturesAt) - position.startAt) / 86400)) : 0;
  const remainingDays = position ? Math.max(0, Math.ceil((position.maturesAt - observedAt) / 86400)) : 0;
  const days = (value: number) => `${value.toLocaleString()} ${value === 1 ? "day" : "days"}`;
  const term = !timeline ? undefined : timeline.status === "Active"
    ? [`${days(elapsedDays)} elapsed`, `${days(remainingDays)} remaining`]
    : timeline.status === "Mature" ? [`${days(elapsedDays)} elapsed`, "Matured"] : [timeline.caption];
  return (
    <section className="sale-position" aria-label={`${name} stake details`}>
      <div className="sale-identity">
        <img src="/wiseone-logo.png" width="40" height="48" alt="" />
        <div>
          <span>WISE / Ethereum</span>
          <h3>{name} Stake #{tokenId}</h3>
        </div>
      </div>
      <div className="sale-position-details">
        {!position && fallback ? fallback : <>
          <dl className="sale-facts">
            <div>
              <dt>Staked principal</dt>
              <dd>
                {position ? `${wiseAmount(position.principal)} WISE` : "—"}
                <small>{position ? usdAmount(position.principal, usd) : "—"}</small>
              </dd>
            </div>
            <div>
              <dt>Unclaimed interest</dt>
              <dd>
                {position ? `${interestAmount(position.unclaimedInterest)} WISE` : "—"}
                <small>{position ? usdAmount(position.unclaimedInterest, usd) : "—"}</small>
              </dd>
            </div>
            <div className={term ? "sale-yield" : undefined}>
              <dt>Annualized yield</dt>
              <dd>
                {!position ? "—" : `${yieldPercent(yieldValue)}%`}
              </dd>
              {term && <p className="sale-term">{term.map(part => <span key={part}>{part}</span>)}</p>}
            </div>
          </dl>
          <div className="sale-dates">
            <div>
              <span>Started / UTC</span>
              <strong>{position ? stakeDate(position.startAt) : "—"}</strong>
            </div>
            <div>
              <span>Maturity / UTC</span>
              <strong>{position ? stakeDate(position.maturesAt) : "—"}</strong>
            </div>
          </div>
        </>}
      </div>
    </section>
  );
}

/** Saved orders remain cancellable even when stake reads are unavailable. */
export function CancellationOrderDetails({ order }: { order: WireSaleOrder }) {
  const expiry = new Date(Number(order.deadline) * 1000);
  return (
    <dl className="sale-facts">
      <div><dt>Order type</dt><dd>{order.kind === 0 ? "Sale listing" : "Purchase bid"}</dd></div>
      <div>
        <dt>Expires / UTC</dt>
        <dd><time dateTime={expiry.toISOString()}>
          {expiry.toLocaleString("en-GB", { timeZone: "UTC", day: "numeric",
            month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </time></dd>
      </div>
    </dl>
  );
}
