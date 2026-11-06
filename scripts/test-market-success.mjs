import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { parseSignedSale, serializeSale } from '../src/lib/blend/sales.ts';
import { parseEther } from 'viem';
import { STAKE_COLLECTIONS } from '../src/lib/blend/stake-collections.ts';
import { readPublication, settlementSuccess } from '../src/lib/market/success.ts';
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


const settled = (kind = 0, collection = STAKE_COLLECTIONS.signature) => ({
 receipt: { status: 'success', transactionHash: tx, logs: [{ data: 'private implementation detail' }] },
 hash,
 order: { kind, collection: collection.address, tokenId: 40n,
  amount: parseEther('300.000000000000000001'), feeBps: collection.purchaseFeeBps },
});
test('purchase receipt keeps the confirmed transaction distinct from the signed order', () => {
 const receipt = settlementSuccess(settled());
 assert.equal(receipt.kind, 'settlement'); assert.equal(receipt.action, 'purchase');
 assert.equal(receipt.transactionHash, tx); assert.equal(receipt.hash, hash);
 assert.equal(receipt.tokenId, '40'); assert.equal(receipt.destination, '/garuda/?screen=stakes');
 assert.equal(receipt.gross, 300000000000000000001n);
 assert.equal(receipt.fee, 1500000000000000000n);
 assert.equal(receipt.net, 298500000000000000001n);
 assert.equal(receipt.logs, undefined); assert.equal(receipt.signature, undefined);
});
test('accepted bid receipts show net proceeds using each collection fee without rounding WISE', () => {
 for (const collection of Object.values(STAKE_COLLECTIONS)) {
  const receipt = settlementSuccess(settled(1, collection));
  assert.equal(receipt.action, 'accept-bid');
  assert.equal(receipt.fee, collection.id === 'signature' ? 1500000000000000000n : 6000000000000000000n);
  assert.equal(receipt.net + receipt.fee, receipt.gross);
  assert.equal(receipt.destination, `/garuda/?screen=trade&collection=${collection.id}&view=market&book=bids`);
 }
});
test('failed or incomplete settlement receipts cannot become success screens or explorer links', () => {
 for (const receipt of [
  { status: 'reverted', transactionHash: tx },
  { status: 'success' },
  { status: 'success', transactionHash: 'https://example.com' },
  { status: 'success', transactionHash: '0x1234' },
 ]) assert.throws(() => settlementSuccess({ ...settled(), receipt }), /confirmed settlement/);
 assert.throws(() => settlementSuccess({ ...settled(), hash: 'bad hash' }), /confirmed settlement/);
});


function publicationRouteFixture() {
 return readFile(new URL('./fixtures/signature-market.json',import.meta.url),'utf8').then(JSON.parse).then(deployment=>{
  const signed={signature:'0x1234',order:serializeSale({kind:0,maker:`0x${'1'.repeat(40)}`,owner:`0x${'1'.repeat(40)}`,
   collection:deployment.collection,currency:deployment.currency,tokenId:53n,stakeId:`0x${'55'.repeat(16)}`,stateHash:`0x${'66'.repeat(32)}`,
   amount:1000n,nonce:1n,epoch:0n,counter:0n,startTime:1000n,deadline:87400n,feeBps:deployment.feeBps,feeRecipient:deployment.feeRecipient})};
  const row={...signed,hash:parseSignedSale(signed,deployment).hash,status:'available'};
  return {signed,row,deployment};
 });
}
test('saving an order starts queued publication immediately without waiting for Arkiv',async()=>{
 const {signed,row,deployment}=await publicationRouteFixture();
 const calls=[];let finish;
 const service={store:{deployment},publish:async()=>{calls.push('saved');return {created:true,order:row};}};
 const app=new Hono();
 registerMarketRoutes(app,async()=>service,'/api/garuda',async passed=>{
  assert.equal(passed,service);calls.push('publish');
  return new Promise(resolve=>{finish=resolve;});
 });
 const response=await app.request('/api/garuda/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signed)});
 assert.equal(response.status,201);
 assert.deepEqual(calls,['saved','publish']);
 assert.deepEqual((await response.json()).arkiv,{state:'queued'});
 finish(true);
});

test('publication worker failures do not undo a durably saved order',async()=>{
 const {signed,row,deployment}=await publicationRouteFixture();
 const service={store:{deployment},publish:async()=>({created:false,order:row})};
 let attempts=0;
 const app=new Hono();
 registerMarketRoutes(app,async()=>service,'/api/garuda',async()=>{attempts++;throw Error('Arkiv unavailable');});
 const response=await app.request('/api/garuda/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signed)});
 assert.equal(response.status,200);assert.equal(attempts,1);
 assert.deepEqual((await response.json()).arkiv,{state:'queued'});
 service.publish=async()=>{throw Error('Storage unavailable');};
 assert.equal((await app.request('/api/garuda/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signed)})).status,503);
 assert.equal((await app.request('/api/garuda/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
 assert.equal(attempts,1,'unsaved or invalid orders must not trigger publication');
});
