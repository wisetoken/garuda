import { ArrowUpRight, Check, ChevronRight, Clock3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SignaturePosition } from '../lib/blend/live-portfolio';
import { STAKE_COLLECTIONS, stakeCollection } from '../lib/blend/stake-collections';
import { stakeDate as formatDate, stakeTimeline, stakeYield } from '../lib/blend/stake-art';
import { loadStakeCreationTx } from '../lib/blend/stake-creation-tx';
import { ethereumClient, useWiseUsd, wiseAmount, usdAmount } from '../lib/portfolio';
import './stake-card.css';

export function StakeCard({ position, onList, actions }: { position: SignaturePosition; onList?: () => void; actions?: ReactNode }) {
  const {data:price}=useWiseUsd();
  const collection=position.collection??STAKE_COLLECTIONS.signature.address;
  const {data:hash}=useQuery({queryKey:['stake-creation',collection,position.stakeId],queryFn:()=>loadStakeCreationTx(ethereumClient,position.stakeId,collection),staleTime:Infinity});
  const timeline=stakeTimeline(position),yieldValue=stakeYield(position);
  const showInterestUsd = !!price && Number(position.unclaimedInterest) / 1e18 * price >= 0.01;
  const stake={...timeline,id:position.tokenId,collection:stakeCollection(collection).name,principal:wiseAmount(position.principal),principalUsd:usdAmount(position.principal,price),interest:wiseAmount(position.unclaimedInterest),interestUsd:usdAmount(position.unclaimedInterest,price),annualYield:yieldValue?.toLocaleString('en-US',{maximumFractionDigits:2})??'—',progress:Math.round(timeline.progress*100),started:new Date(position.startAt*1000).toISOString(),maturity:new Date(position.maturesAt*1000).toISOString(),creationTransactionHash:hash};
  const stakeDate=(date:string)=>formatDate(Date.parse(date)/1000);
  return <article className="garuda-stake-card" aria-label={`${stake.collection} Stake #${stake.id}`} data-status={stake.status}>
    <div className="garuda-stake-face">
      <header className="garuda-stake-heading">
        <div className="garuda-stake-identity"><img src="/wiseone-logo.png" width="40" height="40" alt="" /><div><span>WISE / Ethereum</span><h2>{stake.collection} Stake #{stake.id}</h2></div></div>
        <span className="garuda-stake-status">{stake.status === 'Mature' ? <Check size={12} aria-hidden="true" /> : <Clock3 size={12} aria-hidden="true" />}{stake.status}</span>
      </header>
      <div className="garuda-stake-principal"><span>Staked principal</span><p>{stake.principal} <small>WISE</small></p><span>{stake.principalUsd}</span></div>
      <div className="garuda-stake-timeline">
        <div className="garuda-stake-time-caption"><span>{stake.caption}</span><span>{stake.progress}%</span></div>
        <div className="garuda-stake-progress" role="progressbar" aria-label="Stake term elapsed" aria-valuenow={stake.progress} aria-valuemin={0} aria-valuemax={100}><span className={stake.status === 'Active' ? 'progress-fill-sweep-ltr' : undefined} style={{width: `${stake.progress}%`}} /></div>
        <div className="garuda-stake-dates"><div><span>Started / UTC</span><div className="garuda-stake-start-date"><time dateTime={stake.started}>{stakeDate(stake.started)}</time>{stake.creationTransactionHash && /^0x[a-fA-F0-9]{64}$/.test(stake.creationTransactionHash) && <a className="garuda-stake-creation-link" href={`https://etherscan.io/tx/${stake.creationTransactionHash}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${stake.collection} Stake #${stake.id} creation transaction on Etherscan (opens in a new tab)`} title="View creation transaction on Etherscan"><ArrowUpRight size={14} aria-hidden="true" /></a>}</div></div><div><span>Maturity / UTC</span><time dateTime={stake.maturity}>{stakeDate(stake.maturity)}</time></div></div>
      </div>
      <dl className="garuda-stake-metrics">
        <div><dt>Unclaimed interest</dt><dd>{stake.interest} <small>WISE</small></dd>{showInterestUsd && <span>{stake.interestUsd}</span>}</div>
        <div><dt title="Simple annualized yield based on past accrued interest. Future returns may vary.">Annualized yield</dt><dd>{stake.annualYield}%</dd></div>
      </dl>
    </div>
    <div className="garuda-stake-footer"><div className="garuda-stake-actions">
      {actions ?? <><button className="stake-primary" disabled={!position.canList || !onList} onClick={onList}>List for sale <ArrowUpRight size={17} aria-hidden="true" /></button>
      <Link className="ba-text-button" to={`/garuda/?screen=lend&collection=${stakeCollection(collection).id}&tokenId=${position.tokenId}`}>Explore borrowing <ChevronRight size={17} aria-hidden="true" /></Link></>}
    </div></div>
  </article>;
}
