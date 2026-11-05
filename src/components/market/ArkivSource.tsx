import { ExternalLink } from 'lucide-react';
import type { SaleRow } from '../../lib/blend/sales';
import './arkiv-source.css';

export function ArkivSource({source,onChange,failed,onRetry}: {
  source:'arkiv'|'catalog';onChange:(source:'arkiv'|'catalog')=>void;failed:boolean;onRetry:()=>void;
}) {
  return <div className="arkiv-source">
    <div role="group" aria-label="Order discovery source">
      <span>Discover through</span>
      <button aria-pressed={source==='arkiv'} onClick={()=>onChange('arkiv')}>Arkiv</button>
      <button aria-pressed={source==='catalog'} onClick={()=>onChange('catalog')}>All orders</button>
    </div>
    {source==='arkiv' ? <p role={failed?'alert':undefined}>{failed ? <>
      Arkiv discovery is unavailable. <button onClick={onRetry}>Retry</button> or choose All orders.
    </> : 'Listings and bids published on Arkiv. Availability verified on Ethereum.'}</p>
    : <p>The complete order catalog, including orders awaiting Arkiv publication.</p>}
  </div>;
}
export function ArkivPublication({row}: {row:SaleRow}) {
  const key=row.arkivEntity ?? row.arkiv?.entityKey;
  if(key && /^0x[0-9a-f]{64}$/i.test(key)) return <a className="arkiv-publication" href={`https://rabdi.explorer.arkiv.network/entity/${key}`} target="_blank" rel="noopener noreferrer">
    View on Arkiv <ExternalLink size={14} aria-hidden="true" />
  </a>;
  if(!row.arkiv || row.arkiv.state==='unavailable') return null;
  return <p className="arkiv-publication" role="status">{row.arkiv.state==='retrying' ? 'Arkiv publication will retry automatically.' : 'Publishing to Arkiv…'}</p>;
}
