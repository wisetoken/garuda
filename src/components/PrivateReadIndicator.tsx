import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { privateReadSession, privateReadsEnabled } from '../lib/private-rpc';

export function PrivateReadIndicator() {
  const status = useSyncExternalStore(privateReadSession.subscribe,privateReadSession.getSnapshot,privateReadSession.getSnapshot);
  if (!privateReadsEnabled() || status.phase === 'error') return null;
  const label = status.phase === 'starting' ? 'Connecting Nym…' : 'Private reads';
  return <Link to="/crops#private-reads" className="theme-toggle private-read-indicator" aria-label={label}>
    <ShieldCheck size={20} aria-hidden="true" />
    <span className="private-read-tooltip" aria-hidden="true">{label}</span>
  </Link>;
}
