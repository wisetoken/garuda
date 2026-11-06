import type { PoolClient } from 'pg';
import type { SaleStore } from './store';
import type { SalesService } from './service';
import { arkivRuntime, publishArkiv } from './arkiv';
import { ORDER_SCHEMA_VERSION } from './arkiv-schema';
import { SalesError } from '../../src/lib/blend/sales';

export const PUBLICATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS garuda_arkiv_publications (
 scope text NOT NULL, hash text NOT NULL, state text NOT NULL DEFAULT 'queued',
 attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(),
 entity_key text, tx_hash text, error_code text, PRIMARY KEY(scope,hash)
);
ALTER TABLE garuda_arkiv_publications ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;`;
export async function enqueuePublication(db: PoolClient, scope: string, hash: string) {
  await db.query(`INSERT INTO garuda_arkiv_publications(scope,hash,schema_version) VALUES($1,$2,$3)
    ON CONFLICT(scope,hash) DO UPDATE SET schema_version=EXCLUDED.schema_version,state='queued',attempts=0,next_attempt=now(),error_code=NULL,entity_key=NULL,tx_hash=NULL
    WHERE garuda_arkiv_publications.schema_version < EXCLUDED.schema_version`, [scope,hash,ORDER_SCHEMA_VERSION]);
}
export async function seedPublications(store: SaleStore) {
  await store.pool.query(`INSERT INTO garuda_arkiv_publications(scope,hash,schema_version)
    SELECT scope,hash,$3 FROM blend_sale_orders WHERE scope=$1 AND deadline>$2
    ON CONFLICT(scope,hash) DO UPDATE SET schema_version=EXCLUDED.schema_version,state='queued',attempts=0,next_attempt=now(),error_code=NULL,entity_key=NULL,tx_hash=NULL
    WHERE garuda_arkiv_publications.schema_version < EXCLUDED.schema_version`, [store.scope,Math.floor(Date.now()/1000),ORDER_SCHEMA_VERSION]);
}
export async function publicationStates(store: SaleStore, hashes: string[]) {
  const result = await store.pool.query(`SELECT hash,state,entity_key,tx_hash FROM garuda_arkiv_publications
    WHERE scope=$1 AND hash=ANY($2::text[])`,[store.scope,hashes]);
  return new Map(result.rows.map(row=>[row.hash,{state:row.state,entityKey:row.entity_key ?? undefined,txHash:row.tx_hash ?? undefined}]));
}
export async function processPublication(service: SalesService, runtime = arkivRuntime(), publish = publishArkiv) {
  if (!runtime?.writer) return false;
  const store = service.store;
  const result = await store.pool.query(`UPDATE garuda_arkiv_publications SET state='publishing',
    attempts=attempts+1,next_attempt=now()+interval '5 minutes'
    WHERE (scope,hash) IN (SELECT scope,hash FROM garuda_arkiv_publications
      WHERE scope=$1 AND state IN ('queued','retrying','publishing') AND next_attempt<=now()
      ORDER BY next_attempt LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING hash,attempts`,[store.scope]);
  const job = result.rows[0];
  if (!job) return false;
  try {
    const receipt = await publish(service,job.hash,runtime);
    await store.pool.query(`UPDATE garuda_arkiv_publications SET state='published',entity_key=$3,tx_hash=COALESCE($4,tx_hash),error_code=NULL
      WHERE scope=$1 AND hash=$2`,[store.scope,job.hash,receipt.entityKey,receipt.txHash ?? null]);
  } catch(error) {
    const terminal = error instanceof SalesError && error.code === 'order-unavailable' &&
      /expired|sold|transferred|owner-changed|stake-changed|cancelled|signature-invalid|reorged/.test(error.message);
    const delay = Math.min(3600,30 * 2 ** Math.min(job.attempts-1,7));
    await store.pool.query(`UPDATE garuda_arkiv_publications SET state=$3,error_code=$4,
      next_attempt=now()+($5::int * interval '1 second') WHERE scope=$1 AND hash=$2`,
      [store.scope,job.hash,terminal?'unavailable':'retrying',error instanceof SalesError?error.code:'arkiv-unavailable',delay]);
  }
  return true;
}
