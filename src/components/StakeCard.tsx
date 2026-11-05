import { ArrowUpRight, Check, ChevronRight, Clock3 } from 'lucide-react';
import { stakeDate, type StakeViewModel } from '../data/stake-preview';
import './stake-card.css';

export function StakeCard({ stake }: { stake: StakeViewModel }) {
  return <article className="garuda-stake-card" aria-label={`${stake.collection} #${stake.id}`} data-status={stake.status}>
    <div className="garuda-stake-face">
      <header className="garuda-stake-heading">
        <div className="garuda-stake-identity"><img src="/wiseone-logo.png" width="40" height="40" alt="" /><div><span>WISE / Ethereum</span><h2>{stake.collection} #{stake.id}</h2></div></div>
        <span className="garuda-stake-status">{stake.status === 'Mature' ? <Check size={12} aria-hidden="true" /> : <Clock3 size={12} aria-hidden="true" />}{stake.status}</span>
      </header>
      <div className="garuda-stake-principal"><span>Staked principal</span><p>{stake.principal} <small>WISE</small></p><span>≈ ${stake.principalUsd}</span></div>
      <div className="garuda-stake-timeline">
        <div className="garuda-stake-time-caption"><span>{stake.caption}</span><span>{stake.progress}%</span></div>
        <div className="garuda-stake-progress" role="progressbar" aria-label="Stake term elapsed" aria-valuenow={stake.progress} aria-valuemin={0} aria-valuemax={100}><span className={stake.status === 'Active' ? 'progress-fill-sweep-ltr' : undefined} style={{width: `${stake.progress}%`}} /></div>
        <div className="garuda-stake-dates"><div><span>Started / UTC</span><time dateTime={stake.started}>{stakeDate(stake.started)}</time></div><div><span>Maturity / UTC</span><time dateTime={stake.maturity}>{stakeDate(stake.maturity)}</time></div></div>
      </div>
      <dl className="garuda-stake-metrics">
        <div><dt>Unclaimed interest</dt><dd>{stake.interest} <small>WISE</small></dd><span>≈ {stake.interestUsd}</span></div>
        <div><dt>Annualized yield*</dt><dd>{stake.annualYield}%</dd><span>*Simple, historical</span></div>
      </dl>
    </div>
    <div className="garuda-stake-footer"><div className="garuda-stake-actions">
      <button className="stake-primary" disabled aria-describedby="preview-notice">List for sale <ArrowUpRight size={17} aria-hidden="true" /></button>
      <button className="ba-text-button" disabled aria-describedby="preview-notice">Explore borrowing <ChevronRight size={17} aria-hidden="true" /></button>
    </div></div>
  </article>;
}
