import { ExternalLink } from 'lucide-react';
import type { SaleRow } from '../../lib/blend/sales';
import './arkiv-source.css';

export function ArkivSource({source,onChange,onReload,useCache,onCacheChange}: {
  useCache:boolean;onCacheChange:(enabled:boolean)=>void;
  source:'arkiv'|'catalog';onChange:(source:'arkiv'|'catalog')=>void;onReload:(source:'arkiv'|'catalog')=>void;
}) {
  return <div className="arkiv-source">
    <div role="group" aria-label="Order discovery source">
      <span>Discover through</span>
      <button aria-pressed={source==='arkiv'} title="Double-click to reload without cache" onClick={()=>onChange('arkiv')} onDoubleClick={()=>onReload('arkiv')}>Arkiv</button>
      <button aria-pressed={source==='catalog'} title="Double-click to reload without cache" onClick={()=>onChange('catalog')} onDoubleClick={()=>onReload('catalog')}>Graph</button>
    </div>
    <div className="arkiv-source-options">
    {source==='arkiv' ? <p>Listings and bids published on Arkiv. Availability verified on Ethereum.</p>
    : <p>The service order catalog, for comparison with Arkiv.</p>}
      <label className="market-cache-toggle" title="Reuse recently loaded order results. Turn off to refetch the current tab.">
        <input type="checkbox" role="switch" checked={useCache} onChange={event=>onCacheChange(event.target.checked)} />
        <span className="market-cache-track" aria-hidden="true" />
        <span>Use cache</span>
      </label>
    </div>
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
