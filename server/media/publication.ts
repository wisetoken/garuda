import type { PoolClient } from 'pg';
import { defineSchema, str, bytes } from '@arkiv-network/sdk/schema';
import { and, eq } from '@arkiv-network/sdk/query';
import { ExpirationTime } from '@arkiv-network/sdk';
import { hexToString, stringToBytes } from 'viem';
import type { SalesService } from '../market/service';
import type { SaleStore } from '../market/store';
import { arkivRuntime, arkivScope } from '../market/arkiv';
import { readOrderMetadata } from '../market/arkiv-metadata';
import { SalesError } from '../../src/lib/blend/sales';
import type { MediaBackupStatus, MediaReceipt } from '../../src/lib/market/media';
import { prepareArtwork, ARTWORK_RENDERER, type PreparedArtwork } from './artwork';
import { swarmConfig, uploadFile, verifyFile } from './swarm';

export const MEDIA_SCHEMA = `CREATE TABLE IF NOT EXISTS garuda_media_backups (
 scope text NOT NULL, hash text NOT NULL, state text NOT NULL DEFAULT 'queued',
 attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(),
 prepared jsonb, image jsonb, metadata jsonb, receipt jsonb, PRIMARY KEY(scope,hash)
);`;
export const ArkivMedia = defineSchema('wiseone.garuda.media.v1', {
  scope: str().indexed(), orderHash: str().indexed(), collection: str().indexed(), tokenId: str().indexed(),
  renderer: str().indexed(), manifest: bytes(),
});
export async function enqueueMedia(db: PoolClient, scope: string, hash: string) {
  await db.query('INSERT INTO garuda_media_backups(scope,hash) VALUES($1,$2) ON CONFLICT DO NOTHING', [scope,hash]);
}
export async function seedMedia(store: SaleStore) {
  await store.pool.query(`INSERT INTO garuda_media_backups(scope,hash)
    SELECT scope,hash FROM blend_sale_orders WHERE scope=$1 AND deadline>$2 ON CONFLICT DO NOTHING`,
    [store.scope,Math.floor(Date.now()/1000)]);
}
export async function mediaStatus(store: SaleStore, hash: string): Promise<MediaBackupStatus> {
  const result = await store.pool.query('SELECT state,receipt FROM garuda_media_backups WHERE scope=$1 AND hash=$2',[store.scope,hash]);
  const job = result.rows[0];
  // Existing receipts remain usable if future uploads are disabled.
  if (job?.state === 'ready') return { state:'ready', receipt:job.receipt,
    gateway:process.env.SWARM_GATEWAY_URL || undefined };
  if (process.env.SWARM_MEDIA_ENABLED !== 'true') return {state:'disabled'};
  return {state:job?.state ?? 'queued'};
}
export async function publishMediaManifest(service: SalesService, receipt: MediaReceipt, runtime = arkivRuntime()) {
  if (!runtime?.writer) throw new Error('Arkiv publisher required for artwork references.');
  if (await runtime.reader.getChainId() !== 7794095) throw new Error('Rabdi required.');
  const scope = arkivScope(service.store.deployment);
  const body = JSON.stringify(receipt);
  const existing = await runtime.reader.select().from(ArkivMedia)
    .where(and(eq('scope',scope),eq('orderHash',receipt.orderHash))).ownedBy(runtime.publisher).limit(1).fetch();
  if (existing.entities.length) {
    const saved = JSON.parse(hexToString(existing.entities[0].manifest.value));
    // A prior write may have succeeded before the database recorded its receipt.
    if (saved.image?.reference !== receipt.image.reference || saved.metadata?.reference !== receipt.metadata.reference ||
      saved.image?.sha256 !== receipt.image.sha256 || saved.metadata?.sha256 !== receipt.metadata.sha256 ||
      saved.orderHash !== receipt.orderHash || saved.collection !== receipt.collection || saved.tokenId !== receipt.tokenId)
      throw new Error('Existing artwork reference differs.');
    return existing.entities[0].$key;
  }
  const result = await runtime.writer.createEntity(ArkivMedia, {
    scope,orderHash:receipt.orderHash,collection:receipt.collection.toLowerCase(),tokenId:receipt.tokenId,
    renderer:receipt.renderer,manifest:stringToBytes(body),
  }, {expiration:ExpirationTime.fromDays(90)});
  const entity = await runtime.reader.getEntity(result.entityKey,ArkivMedia);
  if (hexToString(entity.manifest.value) !== body) throw new Error('Artwork reference read-back differs.');
  return result.entityKey;
}
export async function processMediaBackup(service: SalesService, { config = swarmConfig(), runtime = arkivRuntime(),
  readMetadata = readOrderMetadata, upload = uploadFile, verify = verifyFile, publish = publishMediaManifest } = {}) {
  if (!config || !runtime?.writer) return false;
  if (service.store.deployment.environment !== 'ethereum-mainnet') return false;
  const store = service.store;
  const claim = await store.pool.query(`UPDATE garuda_media_backups SET state='uploading',attempts=attempts+1,next_attempt=now()+interval '15 minutes'
    WHERE (scope,hash) IN (SELECT scope,hash FROM garuda_media_backups WHERE scope=$1
    AND state IN ('queued','retrying','uploading') AND next_attempt<=now()
    ORDER BY next_attempt LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, [store.scope]);
  const job = claim.rows[0]; if (!job) return false;
  try {
    if (!(await store.limit('swarm-artwork',4,3600))) throw new Error('Artwork publication budget reached.');
    const row = await service.get(job.hash);
    if (row.status !== 'available') throw new SalesError('order-unavailable',`Order is ${row.status}.`);
    let prepared = job.prepared as PreparedArtwork | null;
    if (!prepared) {
      const observed = await readMetadata(service,row);
      prepared = prepareArtwork(row,observed.snapshot);
      await store.pool.query('UPDATE garuda_media_backups SET prepared=$3 WHERE scope=$1 AND hash=$2',[store.scope,job.hash,prepared]);
    }
    // Keep these bytes and references across retries, including a lost upload response.
    const p = prepared.metadata.properties;
    if ((await service.client.getBlock({blockNumber:BigInt(p.observed_block)})).hash !== p.observed_block_hash)
      throw new SalesError('order-unavailable','Artwork observation was reorged.');
    let image = job.image as MediaReceipt['image'] | null;
    if (!image) {
      image = await upload(config,new TextEncoder().encode(prepared.svg),'image/svg+xml','artwork.svg');
      await store.pool.query('UPDATE garuda_media_backups SET image=$3 WHERE scope=$1 AND hash=$2',[store.scope,job.hash,image]);
    }
    const metadataBody = JSON.stringify({...prepared.metadata,image:`bzz://${image.reference}/`,image_sha256:image.sha256});
    let metadata = job.metadata as MediaReceipt['metadata'] | null;
    if (!metadata) {
      metadata = await upload(config,new TextEncoder().encode(metadataBody),'application/json','metadata.json');
      await store.pool.query('UPDATE garuda_media_backups SET metadata=$3 WHERE scope=$1 AND hash=$2',[store.scope,job.hash,metadata]);
    }
    await Promise.all([verify(config,image),verify(config,metadata)]);
    const receipt: MediaReceipt = {version:1,chainId:1,collection:p.collection,tokenId:p.token_id,orderHash:job.hash,
      observedBlock:p.observed_block,observedBlockHash:p.observed_block_hash,observedAt:p.observed_at,
      renderer:ARTWORK_RENDERER,image,metadata,verifiedAt:Math.floor(Date.now()/1000)};
    // Same publisher lock as order writes: serialize Arkiv signer nonce use across workers.
    receipt.arkivEntity = await store.transaction(async db => {
      const lock = await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',[`arkiv:${runtime.publisher.toLowerCase()}`]);
      if (!lock.rows[0].locked) throw new Error('Publisher busy.');
      return publish(service,receipt,runtime);
    });
    await store.pool.query("UPDATE garuda_media_backups SET state='ready',receipt=$3 WHERE scope=$1 AND hash=$2",[store.scope,job.hash,receipt]);
  } catch (error) {
    const terminal = error instanceof SalesError && error.code === 'order-unavailable' &&
      /expired|sold|transferred|owner-changed|stake-changed|cancelled|signature-invalid|reorged/.test(error.message);
    await store.pool.query(`UPDATE garuda_media_backups SET state=$3,next_attempt=now()+($4::int * interval '1 second')
      WHERE scope=$1 AND hash=$2`,[store.scope,job.hash,terminal?'unavailable':'retrying',Math.min(3600,60*2**Math.min(job.attempts-1,6))]);
  }
  return true;
}
