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

// Deduplicate concurrent reads; PostgreSQL holds recent snapshots and Arkiv publication work.
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
  // Reuse a recent local observation before paying for another Arkiv round trip.
  try {
    const local = parseStakeSnapshot(await service.store.stakeSnapshot?.(target), target);
    if ((await service.client.getBlock({blockNumber:BigInt(local.blockNumber)})).hash === local.blockHash)
      return {snapshot:local,source:'cache'};
  } catch { /* Missing, stale or reorged observations require a refresh. */ }
  // Unlike listing discovery, this supplementary cache may safely fall back to Ethereum.
  const cached = await readCached().catch(() => null);
  if (cached) {
    await service.store.saveStakeSnapshot?.(cached);
    return {snapshot: cached, source: 'arkiv'};
  }
  const snapshot = snapshotFromPortfolio(await loadSignaturePortfolio(service.client, target.owner, 1, target.collection, [target.tokenId]));
  parseStakeSnapshot(snapshot, target);
  await service.store.saveStakeSnapshot?.(snapshot);
  // Persisted snapshots are published by the background worker, never by page requests.
  return {snapshot, source: 'ethereum'};
}

/** One durable cache publication per tick; retry on the next tick after outages. */
export async function processStakeSnapshot(service: SalesService, runtime = arkivRuntime()) {
  if (!runtime?.writer || service.store.deployment.environment !== 'ethereum-mainnet') return;
  await service.store.transaction(async db => {
    const lock = await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked', [`arkiv:${runtime.publisher.toLowerCase()}`]);
    if (!lock.rows[0].locked) return;
    const rows = await db.query(`SELECT s.snapshot FROM blend_stake_snapshots s
      WHERE s.scope=$1 AND s.observed_at>s.arkiv_observed_at AND s.observed_at>$2
      AND EXISTS (SELECT 1 FROM blend_sale_orders o WHERE o.scope=s.scope
        AND lower(o.owner)=s.owner AND o.token_id=s.token_id::numeric AND o.deadline>$3)
      ORDER BY s.observed_at ASC LIMIT 1`,
      [service.store.scope,Math.floor(Date.now()/1000)-STAKE_SNAPSHOT_MAX_AGE,Math.floor(Date.now()/1000)]);
    if (!rows.rows.length) return;
    const raw = rows.rows[0].snapshot as StakeSnapshot;
    const snapshot = parseStakeSnapshot(raw, raw);
    if ((await service.client.getBlock({blockNumber:BigInt(snapshot.blockNumber)})).hash !== snapshot.blockHash) return;
    const scope = arkivScope(service.store.deployment);
    const result = await runtime.reader.select().from(ArkivStakeSnapshots).ownedBy(runtime.publisher)
      .where(and(eq('scope',scope),eq('collection',snapshot.collection.toLowerCase()),
        eq('owner',snapshot.owner.toLowerCase()),eq('tokenId',snapshot.tokenId),
        gt('observedAt',u64(BigInt(snapshot.observedAt-1))))).limit(10).fetch();
    const exists = result.entities.some(entity => {
      try { return parseStakeSnapshot(JSON.parse(hexToString(entity.snapshot.value)),snapshot).blockHash === snapshot.blockHash; }
      catch { return false; }
    });
    if (!exists) {
      if (await runtime.reader.getChainId() !== 7794095) return;
      if (!(await service.store.limit('stake-cache-write',24,3600))) return;
      await runtime.writer!.createEntity(ArkivStakeSnapshots, {
        scope,collection:snapshot.collection.toLowerCase(),owner:snapshot.owner.toLowerCase(),tokenId:snapshot.tokenId,
        observedAt:u64(BigInt(snapshot.observedAt)),snapshot:stringToBytes(JSON.stringify(snapshot)),
      },{expiration:ExpirationTime.atDate(new Date((snapshot.observedAt+STAKE_SNAPSHOT_LIFETIME)*1000))});
    }
    await db.query(`UPDATE blend_stake_snapshots SET arkiv_observed_at=GREATEST(arkiv_observed_at,$5)
      WHERE scope=$1 AND collection=$2 AND owner=$3 AND token_id=$4`,
      [service.store.scope,snapshot.collection.toLowerCase(),snapshot.owner.toLowerCase(),snapshot.tokenId,snapshot.observedAt]);
  });
}
