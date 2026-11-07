import type { Address } from 'viem';
import { sameAddress } from '../blend/sales';
import { verifyBackupContracts } from './core';
import { verifyRecoveredOrder, type RecoveredOrder, type RecoveryStatus } from './arkiv';

export type RecoveryEntry = RecoveredOrder & {
  verification: 'pending' | 'unavailable' | 'failed' | 'verified';
  status?: RecoveryStatus;
};
type Reader = Parameters<typeof verifyRecoveredOrder>[0];

export function recoverySnapshots(orders: RecoveredOrder[], verification: 'pending' | 'unavailable' = 'pending'): RecoveryEntry[] {
  return orders.map(order => ({ ...order, status: undefined, verification }));
}
/** Verify every signature variant before deduplicating; a forgery cannot hide a valid record. */
export function visibleRecoveryEntries(entries: RecoveryEntry[]) {
  const rank = { verified: 3, pending: 2, unavailable: 1, failed: 0 };
  const unique = new Map<string, RecoveryEntry>();
  for (const entry of [...entries].sort((a, b) => rank[b.verification] - rank[a.verification] || b.version - a.version)) {
    if (!unique.has(entry.hash)) unique.set(entry.hash, entry);
  }
  return [...unique.values()].sort((a, b) => a.hash.localeCompare(b.hash));
}
export function canExportRecovered(entry: RecoveryEntry, account?: Address) {
  return !!account && entry.verification === 'verified' && !!entry.status && entry.relation === 'own' && sameAddress(entry.signed.order.maker, account);
}
export function canCancelRecovered(entry: RecoveryEntry, account?: Address) {
  return canExportRecovered(entry, account) && ['open', 'not-started'].includes(entry.status!.state);
}

export async function verifyRecoveryEntries(orders: RecoveredOrder[], getClient: () => Reader,
  assertCurrent = () => {}, onUpdate: (entries: RecoveryEntry[]) => void = () => {},
  verifyContracts: typeof verifyBackupContracts = verifyBackupContracts) {
  assertCurrent();
  const entries = recoverySnapshots(orders);
  onUpdate(entries.map(entry => ({ ...entry })));
  if (!orders.length) return entries;
  let client: Reader, block: Awaited<ReturnType<typeof verifyBackupContracts>>;
  try { client = getClient(); block = await verifyContracts(client); }
  catch {
    assertCurrent();
    const unavailable = recoverySnapshots(orders, 'unavailable');
    onUpdate(unavailable);
    return unavailable;
  }
  assertCurrent();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, entries.length) }, async () => {
    while (next < entries.length) {
      assertCurrent();
      const index = next++;
      try {
        const status = await verifyRecoveredOrder(client, orders[index], 1, block);
        entries[index] = { ...orders[index], verification: 'verified', status };
      } catch { entries[index] = { ...orders[index], verification: 'failed' }; }
      assertCurrent();
      onUpdate(entries.map(entry => ({ ...entry })));
    }
  }));
  return entries;
}
