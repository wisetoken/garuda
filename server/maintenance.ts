import type { SalesService } from './market/service';
import { processPublication } from './market/publication';
import { processStakeSnapshot } from './market/stake-cache';
import { processMediaBackup } from './media/publication';

export type ServiceResolver = () => Promise<SalesService | null>;

// Each invocation is bounded to one job per queue and collection. PostgreSQL
// leases and publisher locks coordinate overlapping cron/request invocations.
export async function runMaintenance(resolvers: ServiceResolver[], jobs = [
  processPublication, processStakeSnapshot, processMediaBackup,
]) {
  let failures = 0;
  for (const resolve of resolvers) {
    let service: SalesService | null;
    try { service = await resolve(); }
    catch { failures++; console.error('Garuda worker could not initialize a collection.'); continue; }
    if (!service) continue;
    for (const job of jobs) {
      try { await job(service); }
      catch { failures++; console.error('Garuda background work will retry.'); }
    }
  }
  return { failures };
}
