import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Image as ImageIcon } from 'lucide-react';
import { marketApi } from '../../lib/market/api';
import { fetchSwarmImage, type MediaBackupStatus, type MediaReceipt } from '../../lib/market/media';
import { stakeCollection } from '../../lib/blend/stake-collections';
import type { SaleRow } from '../../lib/blend/sales';
import './market-activity.css';
import './artwork-backup.css';

function VerifiedArtwork({receipt,gateway}: {receipt:MediaReceipt;gateway:string}) {
  const [draft,setDraft]=useState(gateway),[selected,setSelected]=useState(gateway),[attempt,setAttempt]=useState(0);
  const [image,setImage]=useState(''),[error,setError]=useState('');
  const inputId=useId();
  useEffect(()=>{
    const controller=new AbortController(); let url='';
    setImage('');setError('');
    void fetchSwarmImage(selected,receipt.image,AbortSignal.any([controller.signal,AbortSignal.timeout(30_000)]))
      .then(blob=>{ if(!controller.signal.aborted){url=URL.createObjectURL(blob);setImage(url);} })
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Artwork could not load.');});
    return ()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
  },[selected,attempt,receipt.image.reference,receipt.image.sha256]);
  return <>
    <div className="artwork-preview" aria-live="polite">
      {image ? <img src={image} alt={`Archived artwork for Stake #${receipt.tokenId}`} /> : <p>{error || 'Retrieving and verifying artwork…'}</p>}
    </div>
    <form className="artwork-gateway" onSubmit={event=>{event.preventDefault();setSelected(draft.trim());setAttempt(x=>x+1);}}>
      <label htmlFor={inputId}>Read through a Swarm gateway</label>
      <div><input id={inputId} type="url" required value={draft} onChange={event=>setDraft(event.target.value)} placeholder="https://your-gateway.example" /><button className="market-secondary">Load artwork</button></div>
    </form>
    <p className="market-muted">The gateway sees your IP address and requested file reference. Image bytes are checked against the saved SHA-256 before display.</p>
  </>;
}
export function ArtworkBackupDialog({row,onClose}: {row:SaleRow;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),titleId=useId(),collection=stakeCollection(row.order.collection);
  const status=useQuery({queryKey:['artwork-backup',row.hash],queryFn:()=>marketApi<MediaBackupStatus>(collection.id,`media/${row.hash}`),retry:1,
    refetchInterval:query=>['queued','uploading','retrying'].includes(query.state.data?.state ?? '')?15_000:false});
  useEffect(()=>{
    const element=dialog.current!,trigger=document.activeElement as HTMLElement | null,overflow=document.body.style.overflow;
    element.showModal();document.body.style.overflow='hidden';
    return ()=>{element.close();document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus();};
  },[]);
  const receipt=status.data?.state==='ready'?status.data.receipt:undefined;
  const nftPath=`${collection.address}/${encodeURIComponent(row.order.tokenId)}`;
  return <dialog ref={dialog} className="market-activity-dialog artwork-backup-dialog" aria-labelledby={titleId}
    onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="market-activity-heading"><div><h2 id={titleId}><ImageIcon size={22} />Artwork backup</h2><p>{collection.name} Stake #{row.order.tokenId}</p></div>
      <button type="button" className="artwork-backup-close" aria-label="Close artwork backup" onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <div className="artwork-backup-content">
      {status.isError ? <><p>Backup status could not be loaded.</p><button className="market-secondary" onClick={()=>void status.refetch()}>Retry</button></> : status.isPending ? <p role="status">Checking backup status…</p> : receipt ? <>
        <p className="artwork-backup-ready">Swarm backup recorded</p>
        <p>A generated artwork snapshot, observed at Ethereum block {receipt.observedBlock}. It does not replace the NFT's original metadata or live stake information.</p>
        <p className="market-muted">Last verified {new Date(receipt.verifiedAt * 1000).toLocaleString()}.</p>
        <VerifiedArtwork receipt={receipt} gateway={status.data?.gateway ?? ''} />
        <details><summary>Portable references</summary><dl><dt>Artwork · bzz reference</dt><dd>{receipt.image.reference}</dd><dt>Metadata · bzz reference</dt><dd>{receipt.metadata.reference}</dd></dl></details>
        <div className="artwork-backup-links">
          <a className="market-secondary" download={`stake-${receipt.tokenId}-swarm-backup.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(receipt,null,2))}`}>Save references</a>
          {receipt.arkivEntity && /^0x[0-9a-f]{64}$/i.test(receipt.arkivEntity) && <a href={`https://rabdi.explorer.arkiv.network/entity/${receipt.arkivEntity}`} target="_blank" rel="noopener noreferrer">View reference on Arkiv ↗</a>}
          <a href={`https://opensea.io/item/ethereum/${nftPath}`} target="_blank" rel="noopener noreferrer">View NFT on OpenSea ↗</a>
          <a href={`https://etherscan.io/nft/${nftPath}`} target="_blank" rel="noopener noreferrer">View NFT on Etherscan ↗</a>
        </div>
        <p className="market-muted">Storage depends on funded postage and network availability. This is not a permanent-storage guarantee.</p>
      </> : <div className="artwork-backup-empty"><ImageIcon size={40} aria-hidden="true" /><h3>{status.data?.state==='disabled'?'Swarm backup is not enabled':status.data?.state==='unavailable'?'No artwork backup was completed':'Artwork backup is pending'}</h3>
        <p>{status.data?.state==='disabled'?'Artwork backups are not available in this Garuda deployment yet. Your stake and offer are unaffected.':status.data?.state==='unavailable'?'The order became unavailable before its backup completed.':'Your artwork snapshot is waiting for upload, retrieval checks and publication of its reference. Your offer does not need another signature.'}</p>
        <p className="market-muted">No verified Swarm copy is available for this offer yet.</p></div>}
    </div>
  </dialog>;
}
