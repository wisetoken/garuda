import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.ts';
import { runMaintenance } from '../server/maintenance.ts';

const secret = 'a'.repeat(48);
const inactive = async () => null;

test('production maintenance requires the configured bearer secret and is never cached', async () => {
  let calls = 0;
  const app = createApp({ resolvers: [inactive,inactive], cronSecret: () => secret,
    maintain: async () => { calls++; return { failures: 0 }; } });
  for (const authorization of [undefined, '', `Bearer ${'b'.repeat(48)}`, `Bearer ${secret}x`, secret]) {
    const response = await app.request('/api/cron/garuda', { headers: authorization ? { authorization } : {} });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls, 0);
  const response = await app.request('/api/cron/garuda', { headers: { authorization: `Bearer ${secret}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok:true, failures:0 });
  assert.equal(calls, 1);
});

test('maintenance fails closed without a secret and reports failures without exposing internal errors', async () => {
  for (const value of [undefined, '', 'short']) {
    const app = createApp({ resolvers:[inactive,inactive], cronSecret:()=>value,
      maintain:async()=>{ throw Error('Must not run'); } });
    assert.equal((await app.request('/api/cron/garuda', { headers:{authorization:`Bearer ${value}`} })).status, 401);
  }
  for (const maintain of [async()=>({failures:1}), async()=>{throw Error('private connection string');}]) {
    const app=createApp({resolvers:[inactive,inactive],cronSecret:()=>secret,maintain});
    const response=await app.request('/api/cron/garuda',{headers:{authorization:`Bearer ${secret}`}});
    assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/private connection string/);
  }
});

test('health checks the hosted store and distinguishes unavailable configuration or database', async () => {
  let queries=0;
  const service={store:{deployment:{chainId:1},pool:{query:async sql=>{assert.equal(sql,'SELECT 1');queries++;}}}};
  let resolve=async()=>service;
  const app=createApp({resolvers:[()=>resolve(),inactive]});
  let response=await app.request('/api/garuda/health');
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{service:'garuda-market',ok:true,chainId:1});
  assert.equal(queries,1);
  resolve=inactive;
  assert.equal((await app.request('/api/garuda/health')).status,503);
  resolve=async()=>{throw Error('secret database host');};
  response=await app.request('/api/garuda/health');
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret database host/);
});

test('a maintenance invocation does bounded work and continues after one queue fails', async () => {
  const calls=[], service={id:'signature'}, next={id:'advanced'};
  const jobs=[async s=>{calls.push([s.id,'orders']);if(s===service)throw Error('transient failure');},
    async s=>{calls.push([s.id,'snapshots']);}];
  const result=await runMaintenance([async()=>service,inactive,async()=>{throw Error('configuration');},async()=>next],jobs);
  assert.deepEqual(result,{failures:2});
  assert.deepEqual(calls,[['signature','orders'],['signature','snapshots'],['advanced','orders'],['advanced','snapshots']]);
});


test('concurrent cold-start migrations acquire a transaction lock and release connections on failure', async () => {
  const { SaleStore } = await import('../server/market/store.ts');
  const { readFile } = await import('node:fs/promises');
  const deployment=JSON.parse(await readFile(new URL('./fixtures/signature-market.json',import.meta.url),'utf8'));
  for(const fail of [false,true]) {
    const calls=[];
    const db={query:async sql=>{ calls.push(sql);if(fail && sql.includes('CREATE TABLE'))throw Error('DDL failed'); },release:()=>calls.push('release')};
    const store=new SaleStore({connect:async()=>db},deployment);
    if(fail)await assert.rejects(store.migrate(),/DDL failed/);else await store.migrate();
    assert.equal(calls[0],'BEGIN');assert.match(calls[1],/pg_advisory_xact_lock/);assert.match(calls[2],/CREATE TABLE/);
    assert.equal(calls.at(-2),fail?'ROLLBACK':'COMMIT');assert.equal(calls.at(-1),'release');
  }
});
