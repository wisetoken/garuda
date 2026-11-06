import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { readPublication } from '../src/lib/market/success.ts';
import { registerMarketRoutes } from '../server/market/routes.ts';
const hash = `0x${'11'.repeat(32)}`, entity = `0x${'22'.repeat(32)}`, tx = `0x${'33'.repeat(32)}`;

test('pending and retrying publication never expose unconfirmed explorer receipts',()=>{
 for(const state of ['queued','publishing','retrying','unavailable']) {
  const parsed=readPublication({orderHash:hash,publication:{state,entityKey:entity,txHash:tx}},hash);
  assert.equal(parsed.state,state);assert.equal(parsed.entityKey,undefined);assert.equal(parsed.txHash,undefined);
 }
 assert.equal(readPublication({orderHash:hash,publication:null},hash),null);
 assert.deepEqual(readPublication({orderHash:hash,publication:{state:'published',entityKey:entity,txHash:tx}},hash),
  {state:'published',entityKey:entity,txHash:tx});
});
test('receipt identity and explorer identifiers are validated before display',()=>{
 for(const raw of [null,{orderHash:entity,publication:null},{orderHash:hash},
  {orderHash:hash,publication:{state:'published'}},
  {orderHash:hash,publication:{state:'published',entityKey:'javascript:alert(1)'}},
  {orderHash:hash,publication:{state:'published',entityKey:entity,txHash:'https://other.example'}},
  {orderHash:hash,publication:{state:'invented'}}]) assert.throws(()=>readPublication(raw,hash));
});
test('publication polling reads stored receipts without Ethereum or Arkiv calls',async()=>{
 let queries=0,allowed=true,exists=true;
 const service={store:{scope:'scope',limit:async()=>allowed,get:async()=>exists?{}:null,
  pool:{query:async(_sql,params)=>{queries++;assert.deepEqual(params,['scope',[hash]]);return {rows:[{hash,state:'published',entity_key:entity,tx_hash:tx}]}}}}};
 const app=new Hono();registerMarketRoutes(app,async()=>service);
 const response=await app.request(`/api/garuda/arkiv/status/${hash}`);
 assert.equal(response.status,200);assert.deepEqual(readPublication(await response.json(),hash),{state:'published',entityKey:entity,txHash:tx});
 assert.equal(queries,1);
 assert.equal((await app.request('/api/garuda/arkiv/status/bad')).status,400);
 exists=false;assert.equal((await app.request(`/api/garuda/arkiv/status/${hash}`)).status,404);
 allowed=false;assert.equal((await app.request(`/api/garuda/arkiv/status/${hash}`)).status,429);assert.equal(queries,1);
});
test('missing publication record and storage outage are not reported as published',async()=>{
 let broken=false;
 const app=new Hono();registerMarketRoutes(app,async()=>({store:{scope:'scope',limit:async()=>true,get:async()=>({}),pool:{query:async()=>{if(broken)throw Error('offline');return {rows:[]}}}}}));
 const first=await app.request(`/api/garuda/arkiv/status/${hash}`);assert.equal(readPublication(await first.json(),hash),null);
 broken=true;assert.equal((await app.request(`/api/garuda/arkiv/status/${hash}`)).status,503);
});
