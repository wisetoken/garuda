import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, http } from 'viem';
import { arkivReadOptions, inFlightOnly, arkivDiscoveryFailure } from '../server/market/arkiv-reads.ts';

function rpc(failures, status=429) {
 let calls=0;
 const client=createPublicClient({transport:http('https://arkiv.test', {...arkivReadOptions, retryDelay:1,
  fetchFn:async(_url,init)=>{
   calls++;
   if(calls<=failures) return new Response('unavailable',{status});
   const request=JSON.parse(init.body);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result:'0x76edaf'}),{status:200,headers:{'Content-Type':'application/json'}});
  }
 })});
 return {client,count:()=>calls};
}
test('Arkiv read recovers from one upstream 429 without a page refresh',async()=>{
 const r=rpc(1);assert.equal(await r.client.getChainId(),7794095);assert.equal(r.count(),2);
});
test('persistent upstream outages stop after one retry and expose a safe error',async()=>{
 const r=rpc(Infinity);
 await assert.rejects(r.client.getChainId(), error=>{
  const safe=arkivDiscoveryFailure(error);
  assert.equal(safe.code,'rate-limit');assert.match(safe.message,/Arkiv is busy/);
  assert.doesNotMatch(safe.message,/arkiv.test/);return true;
 });
 assert.equal(r.count(),2);
});
test('failed discovery is evicted so a later request can recover',async()=>{
 const run=inFlightOnly();let calls=0;
 const fail=()=>{calls++;throw new Error('offline');};
 const results=await Promise.allSettled([run('bid',fail),run('bid',fail)]);
 assert.ok(results.every(r=>r.status==='rejected'));assert.equal(calls,1);
 assert.equal(await run('bid',async()=>{calls++;return 'recovered';}),'recovered');assert.equal(calls,2);
});
test('different filters never share discovery results',async()=>{
 const run=inFlightOnly();
 assert.deepEqual(await Promise.all([run('bid',async()=>1),run('listing',async()=>2)]),[1,2]);
});
