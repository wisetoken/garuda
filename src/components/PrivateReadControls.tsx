import { useState, useSyncExternalStore } from 'react';
import { ShieldCheck } from 'lucide-react';
import { privateReadSession, privateReadsEnabled, savePrivateReads } from '../lib/private-rpc';
import { useMarketActions } from './MarketActions';

export function PrivateReadControls() {
  const [enabled] = useState(privateReadsEnabled);
  const [testing,setTesting] = useState(false), [message,setMessage] = useState('');
  const status = useSyncExternalStore(privateReadSession.subscribe,privateReadSession.getSnapshot,privateReadSession.getSnapshot);
  const {busy} = useMarketActions();
  async function testConnection() {
    setTesting(true);setMessage('');
    if (privateReadSession.getSnapshot().phase === 'error') privateReadSession.reset();
    try {
      const block = await privateReadSession.request({method:'eth_blockNumber'});
      setMessage(`Private read succeeded at Ethereum block ${BigInt(block).toLocaleString()}. ${enabled ? 'App reads are using Nym.' : 'Turn on private app reads to use this route in Garuda.'}`);
    } catch { setMessage('Nym could not complete the read. No direct fallback was used. You can retry.'); }
    finally { setTesting(false); }
  }
  function changeMode() {
    try { savePrivateReads(!enabled); window.location.reload(); }
    catch { setMessage('This browser could not save the setting. The current connection mode is unchanged.'); }
  }
  const label = status.phase === 'starting' ? 'Starting Nym…' : status.phase === 'error' ? 'Connection unavailable' : status.phase === 'ready' ? 'Nym connection ready' : 'Connection not started';
  return <section id="private-reads" className="ba-private" aria-labelledby="ba-private-title">
    <div className="ba-section-heading"><span className="ba-kicker">PRIVATE ETHEREUM READS · EXPERIMENTAL</span><h2 id="ba-private-title">Look up your stakes without sharing your IP with the RPC.</h2></div>
    <p>Anon-RPC routes supported app reads through the Nym mixnet. The destination RPC still sees the requested addresses and data, but receives the connection from a Nym exit router.</p>
    <div className="ba-private-controls">
      <button type="button" role="switch" aria-checked={enabled} aria-describedby="ba-private-reload" className="ba-private-toggle" onClick={changeMode} disabled={busy || testing}>
        <span className="ba-private-track" aria-hidden="true"><span /></span>Use private app reads
      </button>
      <button type="button" onClick={() => void testConnection()} disabled={testing || busy}>{testing ? 'Testing private connection…' : status.phase === 'error' ? 'Retry private connection' : 'Test private connection'}</button>
      {testing && <button type="button" className="ba-private-cancel" onClick={() => privateReadSession.reset()}>Stop test</button>}
    </div>
    <small id="ba-private-reload">Off by default. Changing the setting reloads this page and clears its in-memory results; reload other open Garuda tabs to apply it there. Private reads may take longer; failures never switch to a direct RPC automatically.</small>
    <p className="ba-private-status" role="status" aria-live="polite"><ShieldCheck size={18} aria-hidden="true" />{message || `${enabled ? 'Private app reads selected' : 'Direct app reads selected'} · ${label}`}</p>
    <dl className="ba-capability-list">
      <div><dt>Covered</dt><dd>Garuda’s Ethereum portfolio reads, funding balances and quotes, onchain ENS lookups, and client-side market checks using the app’s read client.</dd></div>
      <div><dt>Still direct or public</dt><dd>Wallet and embedded-wallet traffic, transactions, Garuda’s API, Arkiv discovery, indexers, pricing services and image loads. The downloadable backup tool has its own direct connection settings.</dd></div>
    </dl>
    <details><summary>Startup, trust and privacy limits</summary><p>Startup makes direct public reads of the Nym specifier contract and downloads its roughly 18 MB worker. The bootstrap RPC and download hosts see your IP; these requests do not include your wallet address. The harness verifies the worker against its onchain hash and runs it in a sandbox without access to your wallet keys or page.</p><p>You still trust the bootstrap RPC, specifier owner, Nym network and the destination RPC’s answers. Public Ethereum activity can remain linkable. Some ENS names may fail because direct offchain lookups are disabled in this mode. This is optional read privacy, not anonymous transactions or an anonymous marketplace.</p><a href="https://ethereum.github.io/anon-rpc/wallets/" target="_blank" rel="noreferrer">How Anon-RPC works ↗</a></details>
  </section>;
}
