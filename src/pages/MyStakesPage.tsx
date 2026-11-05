import { useState } from 'react';
import { ArrowDownUp, LayoutGrid, List } from 'lucide-react';
import { GarudaPageKicker } from '../components/GarudaPageKicker';
import { StakeCard } from '../components/StakeCard';
import { previewStakes, stakeDate } from '../data/stake-preview';
import './my-stakes.css';

const newestFirst = [...previewStakes].sort((a, b) => b.started.localeCompare(a.started));
export function MyStakesPage() {
  const [view, setView] = useState<'cards' | 'table'>('cards');
  return <>
    <title>My stakes | WiseOne | Garuda Extension</title>
    <div className="stakes-page-heading">
      <GarudaPageKicker label="YOUR POSITIONS" description="Choose the position you want to use. Its ownership stays in your wallet until a trade settles." />
      <div className="stakes-title-row"><h1>Start with your stake.</h1>
        <div className="stake-view-switch" role="group" aria-label="Stake view">
          <button aria-pressed={view === 'cards'} onClick={() => setView('cards')}><LayoutGrid size={15} aria-hidden="true" />Cards</button>
          <button aria-pressed={view === 'table'} onClick={() => setView('table')}><List size={15} aria-hidden="true" />Table</button>
        </div>
      </div>
    </div>
    <p className="preview-notice" id="preview-notice">Layout preview · Sample stakes, not connected wallet data. Listing and borrowing are not enabled yet.</p>
    {view === 'cards' ? <div className="stakes-grid">{newestFirst.map(stake => <StakeCard key={`${stake.collection}:${stake.id}`} stake={stake} />)}</div> :
      <div className="stakes-table-wrap"><table className="stakes-table"><caption className="sr-only">Sample NFT stakes, newest first</caption><thead><tr><th>Type</th><th>Stake created ↓</th><th>Maturity progress</th><th>Status</th><th>Amount staked</th><th>Annualized yield*</th><th>Unclaimed interest</th></tr></thead><tbody>{newestFirst.map(stake => <tr key={`${stake.collection}:${stake.id}`}>
        <td><span className="stake-type" tabIndex={0} aria-label={`${stake.collection} #${stake.id}`}><ArrowDownUp size={18} aria-hidden="true" /><span role="tooltip">{stake.collection} #{stake.id}</span></span></td>
        <td><time dateTime={stake.started}>{stakeDate(stake.started)}</time></td>
        <td><div className="table-progress" role="progressbar" aria-label={`${stake.collection} #${stake.id} term elapsed`} aria-valuenow={stake.progress} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${stake.progress}%`}} /></div><small>{stake.progress}% elapsed</small></td>
        <td>{stake.status}<small>{stakeDate(stake.maturity)}</small></td><td>{stake.principal} WISE<small>≈ ${stake.principalUsd}</small></td><td>{stake.annualYield}%<small>Simple, historical</small></td><td>{stake.interest} WISE<small>≈ {stake.interestUsd}</small></td>
      </tr>)}</tbody></table></div>}
  </>;
}
