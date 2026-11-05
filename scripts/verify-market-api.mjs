import assert from 'node:assert/strict';
import { marketFixture } from './fork/market-fixture.mjs';
import { publishSale, fillSale } from '../src/lib/blend/sales-wallet.ts';
import { parseSignedSale } from '../src/lib/blend/sales.ts';
import { saleAmounts } from '../src/lib/blend/seaport.ts';
import { SaleStore } from '../server/market/store.ts';
import { SalesService } from '../server/market/service.ts';
import { registerMarketRoutes } from '../server/market/routes.ts';
import { Pool } from 'pg';
import { Hono } from 'hono';
import { parseEther } from 'viem';
const base = { host: '127.0.0.1', port: 5432, database: process.env.GARUDA_TEST_DATABASE ?? 'garuda_test', user: process.env.USER };
const admin = new Pool(base), schema = `garuda_transfer_check_${Date.now()}`;
let pool, f;
await admin.query(`CREATE SCHEMA ${schema}`);
try {
  pool = new Pool({ ...base, options: `-c search_path=${schema}` });
  f = await marketFixture();
  const d = f.deployment;
  let store = new SaleStore(pool, d);
  await store.migrate();
  // This test catalog starts empty at the fork head. Only later test events can affect its orders.
  const head = await f.client.getBlock();
  await pool.query('INSERT INTO blend_sale_checkpoints(scope,block_number,block_hash) VALUES($1,$2,$3)', [store.scope, String(head.number), head.hash]);
  let service = new SalesService(f.client, store);
  const app = new Hono();
  registerMarketRoutes(app, async () => service);
  async function api(path, body) {
    const response = await app.request(`/api/garuda/${path}`, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const value = await response.json();
    assert.ok(response.ok, String(value.error ?? response.status));
    return value;
  }
  const session = wallet => ({ ...f.session(wallet), validateSale: async signed => {
    const hash = parseSignedSale(signed, d).hash;
    assert.equal((await api(`sales/${hash}`)).status, 'available');
  }});
  let nonce = 1n;
  const publish = (wallet, id, kind) => publishSale(session(wallet), {
    kind, tokenId: id, amount: parseEther('1000'), days: 7, nonce: nonce++,
  }, signed => api('sales', signed));
  for (const id of [20n, 53n]) {
    const ask = await publish(f.seller, id, 0);
    const askHash = parseSignedSale(ask, d).hash;
    assert.equal((await api('sales')).orders.find(row => row.hash === askHash).status, 'available');
    // Recreate DB and service connections to prove signed orders survive a service restart.
    await pool.end();
    pool = new Pool({ ...base, options: `-c search_path=${schema}` });
    store = new SaleStore(pool, d);
    service = new SalesService(f.client, store);
    assert.equal((await api(`sales/${askHash}`)).status, 'available');
    assert.equal((await pool.query('SELECT state FROM garuda_arkiv_publications WHERE hash=$1',[askHash])).rows[0].state, 'queued');
    const sellerBefore = await f.balance(f.seller.account.address);
    const purchase = await fillSale(session(f.buyer), ask);
    assert.equal((await f.owner(id)).toLowerCase(), f.buyer.account.address.toLowerCase());
    assert.equal(await f.balance(f.seller.account.address) - sellerBefore, saleAmounts(purchase.order).net);
    assert.equal((await api(`sales/${askHash}`)).status, 'sold');
    const bid = await publish(f.seller, id, 1);
    const bidHash = parseSignedSale(bid, d).hash;
    assert.equal((await api('sales')).orders.find(row => row.hash === bidHash).status, 'available');
    const ownerBefore = await f.balance(f.buyer.account.address);
    const accepted = await fillSale(session(f.buyer), bid);
    assert.equal((await f.owner(id)).toLowerCase(), f.seller.account.address.toLowerCase());
    assert.equal(await f.balance(f.buyer.account.address) - ownerBefore, saleAmounts(accepted.order).net);
    assert.equal((await api(`sales/${bidHash}`)).status, 'sold');
    assert.equal((await api(`sales/${askHash}`)).status, 'sold');
    console.log(`PASS Signature #${id}: HTTP publication, Postgres persistence across restart, buy, bid acceptance, indexer marks both orders sold`);
  }
} finally {
  if (f) await f.restore();
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  console.log('Temporary test schema removed; fork state reverted.');
}
