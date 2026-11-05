import { ExpirationTime } from '@arkiv-network/sdk';
import { defineSchema, str, bytes, u64 } from '@arkiv-network/sdk/schema';
import { and, eq, gt } from '@arkiv-network/sdk/query';
import { hexToString, stringToBytes } from 'viem';
import { arkivRuntime, arkivScope } from './arkiv';
import type { SalesService } from './service';
import { SalesError } from '../../src/lib/blend/sales';
import { loadSignaturePortfolio } from '../../src/lib/blend/live-portfolio';
import { parseStakeSnapshot, snapshotFromPortfolio, STAKE_SNAPSHOT_MAX_AGE, STAKE_SNAPSHOT_LIFETIME, type StakeDetails, type StakeSnapshot } from '../../src/lib/blend/stake-snapshot';

export const ArkivStakeSnapshots = defineSchema('wiseone.garuda.stakes.v1', {
  scope: str().indexed(), collection: str().indexed(), owner: str().indexed(), tokenId: str().indexed(),
  observedAt: u64().indexed(), snapshot: bytes(),
});

// Per-service in-flight deduplication only; durable cache lives in Arkiv.
const pending = new WeakMap<SalesService, Map<string, Promise<StakeDetails>>>();
export function getStakeDetails(service: SalesService, hash: string, runtime = arkivRuntime()): Promise<StakeDetails> {
  let requests = pending.get(service);
  if (!requests) { requests = new Map(); pending.set(service, requests); }
  const existing = requests.get(hash);
  if (existing) return existing;
  const request = readDetails(service, hash, runtime).finally(() => requests!.delete(hash));
  requests.set(hash, request);
  return request;
}
async function readDetails(service: SalesService, hash: string, runtime: ReturnType<typeof arkivRuntime>): Promise<StakeDetails> {
  const deployment = service.store.deployment;
  if (deployment.environment !== 'ethereum-mainnet') throw new SalesError('network', 'Stake cache is Ethereum-only.');
  if (!(await service.store.limit('stake-details-read', 120))) throw new SalesError('rate-limit', 'Stake details are busy. Retry shortly.');
  const row = await service.store.get(hash);
  if (!row) throw new SalesError('not-found', 'Order not found.');
  const target = row.order;
  const scope = arkivScope(deployment);
  async function readCached(): Promise<StakeSnapshot | null> {
    if (!runtime) return null;
    const result = await runtime.reader.select().from(ArkivStakeSnapshots).ownedBy(runtime.publisher)
      .where(and(eq('scope', scope), eq('collection', target.collection.toLowerCase()),
        eq('owner', target.owner.toLowerCase()), eq('tokenId', target.tokenId),
        gt('observedAt', u64(BigInt(Math.floor(Date.now()/1000) - STAKE_SNAPSHOT_MAX_AGE)))))
      .limit(10).fetch();
    const candidates: StakeSnapshot[] = [];
    for (const entity of result.entities) {
      try { candidates.push(parseStakeSnapshot(JSON.parse(hexToString(entity.snapshot.value)), target)); } catch { /* Ignore malformed/stale hints. */ }
    }
    candidates.sort((a,b) => b.observedAt-a.observedAt);
    for (const snapshot of candidates) {
      // A reorged observation must never survive as a cache hit.
      const block = await service.client.getBlock({blockNumber: BigInt(snapshot.blockNumber)});
      if (block.hash === snapshot.blockHash) return snapshot;
    }
    return null;
  }
  // Unlike listing discovery, this supplementary cache may safely fall back to Ethereum.
  const cached = await readCached().catch(() => null);
  if (cached) {
    await service.store.saveStakeSnapshot?.(cached);
    return {snapshot: cached, source: 'arkiv'};
  }
  const snapshot = snapshotFromPortfolio(await loadSignaturePortfolio(service.client, target.owner, 1, target.collection, [target.tokenId]));
  parseStakeSnapshot(snapshot, target);
  await service.store.saveStakeSnapshot?.(snapshot);
  // No writes for expired orders, forks, or missing publisher. Per-deployment cap
  // bounds public-request spending to 24 testnet refreshes/hour, not one per visitor.
  if (runtime?.writer && Number(target.deadline) > Date.now()/1000) {
    try {
      await service.store.transaction(async db => {
        const lock = await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked', [`arkiv:${runtime.publisher.toLowerCase()}`]);
        if (!lock.rows[0].locked || await readCached()) return;
        if (!(await service.store.limit('stake-cache-write', 24, 3600))) return;
        if (await runtime.reader.getChainId() !== 7794095) return;
        await runtime.writer!.createEntity(ArkivStakeSnapshots, {
          scope, collection: target.collection.toLowerCase(), owner: target.owner.toLowerCase(), tokenId: target.tokenId,
          observedAt: u64(BigInt(snapshot.observedAt)), snapshot: stringToBytes(JSON.stringify(snapshot)),
        }, {expiration: ExpirationTime.atDate(new Date((snapshot.observedAt + STAKE_SNAPSHOT_LIFETIME)*1000))});
      });
    } catch { /* Cache outages/budget exhaustion never prevent live details. */ }
  }
  return {snapshot, source: 'ethereum'};
}
