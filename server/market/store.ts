import { MEDIA_SCHEMA, enqueueMedia } from '../media/publication';
import { PUBLICATION_SCHEMA, enqueuePublication } from './publication';
import { Pool, type PoolClient } from "pg";
import type { Hex } from "viem";
import type { StakeSnapshot } from '../../src/lib/blend/stake-snapshot';
import {
    deploymentScope,
    type SalesDeployment,
    type SignedSale,
    type SaleRow,
} from "../../src/lib/blend/sales";

export const SALES_SCHEMA = `
CREATE TABLE IF NOT EXISTS blend_sale_orders (
 scope text NOT NULL, hash text NOT NULL, maker text NOT NULL, owner text NOT NULL,
 token_id numeric(78,0) NOT NULL, kind smallint NOT NULL CHECK (kind IN (0,1)),
 deadline numeric(78,0) NOT NULL, envelope jsonb NOT NULL,
 published_block bigint NOT NULL, published_hash text NOT NULL,
 sequence bigserial NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope,hash)
);
CREATE INDEX IF NOT EXISTS blend_sale_orders_page ON blend_sale_orders(scope,sequence DESC);
CREATE INDEX IF NOT EXISTS blend_sale_orders_maker ON blend_sale_orders(scope,maker);
CREATE TABLE IF NOT EXISTS blend_sale_checkpoints (
 scope text NOT NULL, block_number bigint NOT NULL, block_hash text NOT NULL, PRIMARY KEY(scope,block_number)
);
CREATE TABLE IF NOT EXISTS blend_sale_events (
 scope text NOT NULL, block_number bigint NOT NULL, block_hash text NOT NULL,
 tx_hash text NOT NULL, log_index integer NOT NULL, event_name text NOT NULL,
 token_id numeric(78,0), payload jsonb NOT NULL, PRIMARY KEY(scope,tx_hash,log_index)
);
CREATE INDEX IF NOT EXISTS blend_sale_events_asset ON blend_sale_events(scope,token_id,block_number);
CREATE TABLE IF NOT EXISTS blend_sale_availability (
 scope text NOT NULL, hash text NOT NULL, status text NOT NULL, block_number bigint NOT NULL,
 PRIMARY KEY(scope,hash)
);
CREATE TABLE IF NOT EXISTS blend_stake_snapshots (
 scope text NOT NULL, collection text NOT NULL, owner text NOT NULL, token_id text NOT NULL,
 observed_at bigint NOT NULL, snapshot jsonb NOT NULL, PRIMARY KEY(scope,collection,owner,token_id)
);
ALTER TABLE blend_stake_snapshots ADD COLUMN IF NOT EXISTS arkiv_observed_at bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS blend_sale_limits (
 scope text NOT NULL, bucket text NOT NULL, window_at bigint NOT NULL, count integer NOT NULL,
 PRIMARY KEY(scope,bucket,window_at)
);`;
export type StoredSale = SignedSale & {
    hash: Hex;
    publishedBlock: string;
    publishedBlockHash: Hex;
    sequence: string;
};
export class SaleStore {
    readonly scope: string;
    constructor(
        readonly pool: Pool,
        readonly deployment: SalesDeployment,
    ) {
        this.scope = deploymentScope(deployment);
    }
    async migrate() {
        await this.transaction(async db => {
            // Serverless cold starts may initialize concurrently. Serialize DDL
            // so CREATE IF NOT EXISTS cannot race on PostgreSQL catalog entries.
            await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["garuda-schema"]);
            await db.query(SALES_SCHEMA + PUBLICATION_SCHEMA + MEDIA_SCHEMA);
        });
    }
    async saveAvailability(rows: SaleRow[], blockNumber: bigint) {
        if (!rows.length) return;
        await this.pool.query(`INSERT INTO blend_sale_availability(scope,hash,status,block_number)
            SELECT $1,r.hash,r.status,$2 FROM jsonb_to_recordset($3::jsonb) AS r(hash text,status text)
            ON CONFLICT(scope,hash) DO UPDATE SET status=EXCLUDED.status,block_number=EXCLUDED.block_number
            WHERE blend_sale_availability.block_number<=EXCLUDED.block_number`,
            [this.scope,String(blockNumber),JSON.stringify(rows.map(r=>({hash:r.hash,status:r.status})))]);
    }
    async availability(hashes: string[]) {
        const result=await this.pool.query('SELECT hash,status FROM blend_sale_availability WHERE scope=$1 AND hash=ANY($2::text[])',[this.scope,hashes]);
        return new Map<string,string>(result.rows.map(r=>[r.hash,r.status]));
    }
    async saveStakeSnapshot(snapshot: StakeSnapshot) {
        await this.pool.query(`INSERT INTO blend_stake_snapshots(scope,collection,owner,token_id,observed_at,snapshot)
            VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(scope,collection,owner,token_id) DO UPDATE
            SET observed_at=EXCLUDED.observed_at,snapshot=EXCLUDED.snapshot
            WHERE blend_stake_snapshots.observed_at <= EXCLUDED.observed_at`,
            [this.scope,snapshot.collection.toLowerCase(),snapshot.owner.toLowerCase(),snapshot.tokenId,snapshot.observedAt,snapshot]);
        await this.pool.query('DELETE FROM blend_stake_snapshots WHERE observed_at < $1',[Math.floor(Date.now()/1000)-86400]);
    }
    async stakeSnapshot(target: {collection: string; owner: string; tokenId: string}) {
        const result = await this.pool.query(`SELECT snapshot FROM blend_stake_snapshots
            WHERE scope=$1 AND collection=$2 AND owner=$3 AND token_id=$4`,
            [this.scope,target.collection.toLowerCase(),target.owner.toLowerCase(),target.tokenId]);
        return result.rows[0]?.snapshot as StakeSnapshot | undefined;
    }
    async stakeSnapshots() {
        const result = await this.pool.query('SELECT snapshot FROM blend_stake_snapshots WHERE scope=$1 AND observed_at >= $2',[this.scope,Math.floor(Date.now()/1000)-86400]);
        return result.rows.map(row=>row.snapshot) as StakeSnapshot[];
    }
    async transaction<T>(fn: (db: PoolClient) => Promise<T>) {
        const db = await this.pool.connect();
        try {
            await db.query("BEGIN");
            const value = await fn(db);
            await db.query("COMMIT");
            return value;
        } catch (e) {
            await db.query("ROLLBACK");
            throw e;
        } finally {
            db.release();
        }
    }
    async limit(bucket: string, maximum: number, seconds = 60) {
        const window = Math.floor(Date.now() / 1000 / seconds) * seconds;
        const result = await this.pool.query(
            `INSERT INTO blend_sale_limits(scope,bucket,window_at,count) VALUES($1,$2,$3,1)
          ON CONFLICT(scope,bucket,window_at) DO UPDATE SET count=blend_sale_limits.count+1 RETURNING count`,
            [this.scope, bucket, window],
        );
        // Old buckets are not an unbounded append-only log.
        await this.pool.query(
            "DELETE FROM blend_sale_limits WHERE scope=$1 AND window_at < $2",
            [this.scope, window - 86400],
        );
        return result.rows[0].count <= maximum;
    }
    async publish(
        signed: SignedSale,
        hash: Hex,
        block: bigint,
        blockHash: Hex,
    ) {
        return this.transaction(async (db) => {
            await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
                `${this.scope}:${signed.order.maker.toLowerCase()}`,
            ]);
            const existing = await db.query(
                "SELECT hash FROM blend_sale_orders WHERE scope=$1 AND hash=$2",
                [this.scope, hash],
            );
            if (existing.rowCount) {
                await enqueuePublication(db, this.scope, hash);
                await enqueueMedia(db, this.scope, hash);
                return false; // Keep the original ownership observation.
            }
            const count = await db.query(
                "SELECT count(*)::int AS n FROM blend_sale_orders WHERE scope=$1 AND maker=$2 AND deadline > $3",
                [
                    this.scope,
                    signed.order.maker.toLowerCase(),
                    Math.floor(Date.now() / 1000),
                ],
            );
            if (count.rows[0].n >= 100) throw new Error("Order limit reached");
            await db.query(
                `INSERT INTO blend_sale_orders(scope,hash,maker,owner,token_id,kind,deadline,envelope,published_block,published_hash)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [
                    this.scope,
                    hash,
                    signed.order.maker.toLowerCase(),
                    signed.order.owner.toLowerCase(),
                    signed.order.tokenId,
                    signed.order.kind,
                    signed.order.deadline,
                    JSON.stringify(signed),
                    String(block),
                    blockHash,
                ],
            );
            await enqueuePublication(db, this.scope, hash);
            await enqueueMedia(db, this.scope, hash);
            return true;
        });
    }
    async list(
        filters: {
            maker?: string;
            tokenId?: string;
            before?: string;
            limit?: number;
        } = {},
    ) {
        const result = await this.pool.query(
            `SELECT hash,envelope,published_block,published_hash,sequence FROM blend_sale_orders
          WHERE scope=$1 AND ($2::text IS NULL OR maker=$2) AND ($3::numeric IS NULL OR token_id=$3)
          AND ($4::bigint IS NULL OR sequence<$4) ORDER BY sequence DESC LIMIT $5`,
            [
                this.scope,
                filters.maker?.toLowerCase() ?? null,
                filters.tokenId ?? null,
                filters.before ?? null,
                filters.limit ?? 25,
            ],
        );
        return result.rows.map((r) => ({
            ...r.envelope,
            hash: r.hash,
            publishedBlock: r.published_block,
            publishedBlockHash: r.published_hash,
            sequence: r.sequence,
        })) as StoredSale[];
    }
    async get(hash: string): Promise<StoredSale | null> {
        const result = await this.pool.query(
            "SELECT hash,envelope,published_block,published_hash,sequence FROM blend_sale_orders WHERE scope=$1 AND hash=$2",
            [this.scope, hash],
        );
        const row = result.rows[0];
        return row
            ? {
                  ...row.envelope,
                  hash: row.hash,
                  publishedBlock: row.published_block,
                  publishedBlockHash: row.published_hash,
                  sequence: row.sequence,
              }
            : null;
    }
    async soldSince(hash: Hex, tokenId: string, block: string, head: string) {
        const r = await this.pool.query(
            "SELECT 1 FROM blend_sale_events WHERE scope=$1 AND event_name IN ('SaleValidated','RewardSaleSettled') AND token_id=$2 AND payload->>'orderHash'=$3 AND block_number>=$4 AND block_number<=$5 LIMIT 1",
            [this.scope, tokenId, hash, block, head],
        );
        return Boolean(r.rowCount);
    }
    async transferredSince(tokenId: string, block: string, head: string) {
        const r = await this.pool.query(
            "SELECT 1 FROM blend_sale_events WHERE scope=$1 AND event_name='Transfer' AND token_id=$2 AND block_number>$3 AND block_number<=$4 LIMIT 1",
            [this.scope, tokenId, block, head],
        );
        return Boolean(r.rowCount);
    }
    async activity() {
        const r = await this.pool.query(
            "SELECT block_number,tx_hash,event_name,payload FROM blend_sale_events WHERE scope=$1 AND event_name <> 'Transfer' ORDER BY block_number DESC,log_index DESC LIMIT 30",
            [this.scope],
        );
        return r.rows;
    }
}
