import { stakeCollection } from "./stake-collections";
import { formatEther } from "viem";
import type { SignaturePosition } from "./live-portfolio";

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
export const stakeDate = (seconds: number) => new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
}).format(new Date(seconds * 1000));

export function stakeTimeline(stake: SignaturePosition, at = stake.observedAt ?? Date.now() / 1000) {
  const duration = stake.maturesAt - stake.startAt;
  const progress = duration > 0 ? Math.max(0, Math.min(1, (at - stake.startAt) / duration)) : 0;
  const status: SignaturePosition["status"] = stake.status === "Closed" ? "Closed" : at < stake.startAt ? "Pending" : at >= stake.maturesAt ? "Mature" : "Active";
  const days = Math.max(0, Math.ceil(((status === "Pending" ? stake.startAt : stake.maturesAt) - at) / 86400));
  return { progress, status, caption: status === "Closed" ? "Position closed" : status === "Mature" ? "Lock period complete" : status === "Pending" ? `Starts in ${days.toLocaleString("en-US")} days` : `${days.toLocaleString("en-US")} days to maturity` };
}

/** Self-contained SVG: no remote images, fonts, scripts or wallet identifiers. */
export function stakeYield(stake: SignaturePosition) {
  if (stake.unclaimedInterest === undefined || !stake.rewardDays || stake.principal <= 0n) return null;
  const value = Number(formatEther(stake.unclaimedInterest)) / Number(formatEther(stake.principal)) * 365 / stake.rewardDays * 100;
  return Number.isFinite(value) ? value : null;
}
export function stakeUsd(amount: bigint, wiseUsd?: number) {
  return wiseUsd && Number.isFinite(wiseUsd) && wiseUsd > 0
    ? `≈ ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(formatEther(amount)) * wiseUsd)}`
    : "USD unavailable";
}
export function stakeImage(stake?: SignaturePosition, wiseUsd?: number) {
  const collectionName = stake?.collection ? stakeCollection(stake.collection).name : "Signature";
  const timeline = stake ? stakeTimeline(stake) : undefined;
  const accent = timeline?.status === "Mature" ? "#e5ce91" : timeline?.status === "Pending" ? "#b6c8ff" : timeline?.status === "Closed" ? "#b6c3bd" : "#a3edd0";
  const amount = stake ? Number(formatEther(stake.principal)).toLocaleString("en-US", { maximumFractionDigits: 2, notation: stake.principal >= 10n ** 27n ? "compact" : "standard" }) : "Your stake.";
  const apy = stake ? stakeYield(stake) : null;
  const interest = stake?.unclaimedInterest === undefined ? "—" : `${Number(formatEther(stake.unclaimedInterest)).toLocaleString("en-US", { maximumFractionDigits: 4 })} WISE`;
  const height = stake ? 540 : 440;
  const text = (x: number, y: number, size: number, value: string, color = "#eff7f1", extra = "") => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${escape(value)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${height}" viewBox="0 0 600 ${height}" role="img">
<title>${escape(stake ? `${collectionName} #${stake.tokenId}: ${timeline!.status}, ${stakeDate(stake.startAt)} to ${stakeDate(stake.maturesAt)}` : "WISE stake timeline: start, grow, mature")}</title>
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#234c3b"/><stop offset="1" stop-color="#11251f"/></linearGradient></defs>
<rect width="600" height="${height}" rx="20" fill="url(#bg)"/>
<g font-family="Arial, sans-serif">
${text(32, 42, 12, `WISE / ${collectionName.toUpperCase()}`, "#c1d5ca", 'letter-spacing="3"')}${text(568, 42, 12, "ETHEREUM", "#c1d5ca", 'text-anchor="end" letter-spacing="2"')}
${text(32, 100, 27, stake ? `#${stake.tokenId.padStart(4, "0")}` : "A position with a timeline.")}
<rect x="32" y="123" width="108" height="30" rx="15" fill="${accent}" fill-opacity=".14"/>
${text(86, 143, 13, timeline?.status ?? "YOUR POSITION", accent, 'text-anchor="middle"')}
${text(32, 211, 38, amount)}${text(32, 238, 16, stake ? `WISE principal · ${stakeUsd(stake.principal, wiseUsd)}` : "Connect your wallet to see your dates.", "#c1d5ca")}
<path d="M32 295 H568" stroke="#537264" stroke-width="6" stroke-linecap="round"/>
${timeline ? `<path d="M32 295 H${32 + 536 * timeline.progress}" stroke="${accent}" stroke-width="6" stroke-linecap="round"/><circle cx="${32 + 536 * timeline.progress}" cy="295" r="8" fill="${accent}"/>` : '<circle cx="32" cy="295" r="6" fill="#c1d5ca"/><circle cx="568" cy="295" r="6" fill="#c1d5ca"/>'}
${text(32, 328, 12, "START · UTC", "#c1d5ca")}${text(568, 328, 12, "MATURITY · UTC", "#c1d5ca", 'text-anchor="end"')}
${text(32, 354, 19, stake ? stakeDate(stake.startAt) : "Start your journey")}${text(568, 354, 19, stake ? stakeDate(stake.maturesAt) : "Reach maturity", "#eff7f1", 'text-anchor="end"')}
<path d="M32 380 H568" stroke="#426253"/>
${text(32, 412, 14, timeline?.caption ?? "Buy and sell WISE stakes", accent)}${text(568, 412, 12, timeline ? `${Math.round(timeline.progress * 100)}% of term elapsed` : "GARUDA BY WISEONE", "#c1d5ca", 'text-anchor="end"')}
${stake ? `<path d="M32 432 H568" stroke="#426253"/>
${text(32, 458, 13, "UNCLAIMED INTEREST", "#c1d5ca")}${text(568, 458, 13, "APY*", "#c1d5ca", 'text-anchor="end"')}
${text(32, 487, 23, interest, accent)}${text(568, 487, 23, apy === null ? "—" : `${apy.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`, accent, 'text-anchor="end"')}
${text(32, 515, 13, stake.unclaimedInterest === undefined ? "Interest unavailable" : stakeUsd(stake.unclaimedInterest, wiseUsd), "#c1d5ca")}${text(568, 515, 12, "*Simple annualized yield", "#c1d5ca", 'text-anchor="end"')}` : ""}
</g></svg>`;
}

export function stakeMetadata(stake: SignaturePosition, wiseUsd?: number) {
  const collectionName = stake.collection ? stakeCollection(stake.collection).name : "Signature";
  const timeline = stakeTimeline(stake);
  return {
    name: `WISE ${collectionName} #${stake.tokenId}`,
    description: `A WISE ${collectionName} stake. Dates and status reflect the observed chain state; this image is not a promise of redemption value.`,
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stakeImage(stake, wiseUsd))}`,
    attributes: [
      { trait_type: "Status", value: timeline.status },
      { trait_type: "Principal (WISE)", value: formatEther(stake.principal) },
      { display_type: "date", trait_type: "Start", value: stake.startAt },
      { display_type: "date", trait_type: "Maturity", value: stake.maturesAt },
      ...(stake.unclaimedInterest === undefined ? [] : [{ trait_type: "Unclaimed interest (WISE)", value: formatEther(stake.unclaimedInterest) }]),
      ...(stakeYield(stake) === null ? [] : [{ trait_type: "Simple annualized yield (%)", value: stakeYield(stake)! }]),
      ...(wiseUsd && wiseUsd > 0 && Number.isFinite(wiseUsd) ? [{ trait_type: "Reference WISE price (USD; may be cached)", value: wiseUsd }] : []),
      ...(stake.observedAt ? [{ display_type: "date", trait_type: "Observed at", value: stake.observedAt }] : []),
    ],
  };
}
