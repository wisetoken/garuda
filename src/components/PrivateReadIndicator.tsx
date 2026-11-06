import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { privateReadSession, privateReadsEnabled } from '../lib/private-rpc';

export function PrivateReadIndicator() {
  const status = useSyncExternalStore(privateReadSession.subscribe,privateReadSession.getSnapshot,privateReadSession.getSnapshot);
  if (!privateReadsEnabled() || status.phase === 'error') return null;
  return <Link to="/garuda/?screen=privacy#private-reads" className="private-read-indicator"
    title="Supported app reads use Nym. Wallet and API traffic are separate.">
    <ShieldCheck size={16} aria-hidden="true" />{status.phase === 'starting' ? 'Connecting Nym…' : 'Private reads'}
  </Link>;
}
