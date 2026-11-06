import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { privateReadSession, privateReadsEnabled } from '../lib/private-rpc';

export function PrivateReadIndicator() {
  const status = useSyncExternalStore(privateReadSession.subscribe,privateReadSession.getSnapshot,privateReadSession.getSnapshot);
  if (!privateReadsEnabled()) return null;
  const failed = status.phase === 'error';
  const Icon = failed ? ShieldAlert : ShieldCheck;
  return <Link to="/garuda/?screen=privacy#private-reads" className="private-read-indicator" data-failed={failed}
    title={failed ? 'Nym reads failed. Direct fallback is blocked. Open CROPS to retry.' : 'Supported app reads use Nym. Wallet and API traffic are separate.'}>
    <Icon size={16} aria-hidden="true" />{failed ? 'Private reads unavailable' : status.phase === 'starting' ? 'Connecting Nym…' : 'Private reads'}
  </Link>;
}
