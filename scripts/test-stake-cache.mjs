import test from 'node:test';
import assert from 'node:assert/strict';
import {stringToHex} from 'viem';
import {getStakeDetails,processStakeSnapshot} from '../server/market/stake-cache.ts';
import {snapshotFromPortfolio,parseStakeSnapshot,positionFromSnapshot} from '../src/lib/blend/stake-snapshot.ts';
import {loadSignaturePortfolio,SIGNATURE_COLLECTION,SIGNATURE_WISE} from '../src/lib/blend/live-portfolio.ts';
const owner='0x'+'11'.repeat(20), hash='0x'+'ab'.repeat(32), stakeId='0x'+'12'.repeat(16);
function fixture() {
 const block={number:100n,hash,timestamp:BigInt(Math.floor(Date.now()/1000))};
 let reads=0,writes=0,allowWrite=true,entities=[],broken=false,local,marked=0;
 const client={getChainId:async()=>1,getBlock:async()=>block,readContract:async({functionName})=>{
  reads++;switch(functionName){
   case 'wiseToken':return SIGNATURE_WISE;case 'NFTStake':return stakeId;case 'ownerOf':return owner;
   case 'stakes':return [100n,1000n,0n,10n,365n,375n,0n,0n,0n,0n,owner,true];
   case 'checkStakeByID':return [10n,365n,375n,0n,10n,0n,0n,7n,0n,true,false];
   default:throw Error('unexpected read');
  }
 }};
 const row={order:{collection:SIGNATURE_COLLECTION,owner,tokenId:'53',stakeId,deadline:String(Number(block.timestamp)+3600)}};
 const service={client,store:{deployment:{environment:'ethereum-mainnet',chainId:1,protocol:'seaport-1.6',market:owner,adapter:owner,adapterCodeHash:hash,deploymentBlockHash:hash},get:async()=>row,
  limit:async(bucket)=>bucket==='stake-cache-write'?allowWrite:true,
  scope:'test',saveStakeSnapshot:async snapshot=>{local=snapshot},stakeSnapshot:async()=>local,
  transaction:async fn=>fn({query:async sql=> {
    if(sql.includes('pg_try')) return {rows:[{locked:true}]};
    if(sql.startsWith('UPDATE')) {marked++;return {rows:[]};}
    return {rows:local && local.observedAt>0 && Number(row.order.deadline)>Date.now()/1000 ? [{snapshot:local}]:[]};
  }})}};
 const query={from(){return this},ownedBy(){return this},where(){return this},limit(){return this},async fetch(){if(broken)throw Error('offline');return {entities}}};
 const runtime={publisher:owner,reader:{select:()=>query,getChainId:async()=>7794095},writer:{createEntity:async(_,v)=>{
  writes++;entities=[{snapshot:{value:stringToHex(new TextDecoder().decode(v.snapshot))}}];return {entityKey:hash};
 }}};
 return {service,runtime,row,block,get marked(){return marked},set local(v){local=v},get reads(){return reads},get writes(){return writes},set allowWrite(v){allowWrite=v},set entities(v){entities=v},set broken(v){broken=v}};
}

test('page reads never write Arkiv; repeated reads reuse canonical local snapshots',async()=>{
 const f=fixture();const first=await getStakeDetails(f.service,hash,f.runtime);
 assert.equal(first.source,'ethereum');assert.equal(f.writes,0);
 const reads=f.reads;
 assert.equal((await getStakeDetails(f.service,hash,f.runtime)).source,'cache');
 assert.equal(f.reads,reads);assert.equal(f.writes,0);
 await processStakeSnapshot(f.service,f.runtime);
 assert.equal(f.writes,1);assert.equal(f.marked,1);
 await processStakeSnapshot(f.service,f.runtime);
 assert.equal(f.writes,1); // Arkiv deduplication survives retry after a lost acknowledgement.
});
test('concurrent readers share one live fill',async()=>{
 const f=fixture();const [a,b]=await Promise.all([getStakeDetails(f.service,hash,f.runtime),getStakeDetails(f.service,hash,f.runtime)]);
 assert.equal(a,b);assert.equal(f.reads,5);assert.equal(f.writes,0);
});
test('local stale and reorged snapshots refresh from Ethereum',async()=>{
 const f=fixture();const {snapshot}=await getStakeDetails(f.service,hash,f.runtime);
 for (const patch of [{observedAt:snapshot.observedAt-301},{blockHash:'0x'+'cc'.repeat(32)},{owner:'0x'+'22'.repeat(20)}]) {
  f.local={...snapshot,...patch};
  assert.equal((await getStakeDetails(f.service,hash,f.runtime)).source,'ethereum');
 }
});
test('worker retries outages and enforces budget, expiry and network',async()=>{
 const f=fixture();await getStakeDetails(f.service,hash,f.runtime);
 f.broken=true;await assert.rejects(processStakeSnapshot(f.service,f.runtime),/offline/);assert.equal(f.marked,0);
 f.broken=false;f.allowWrite=false;await processStakeSnapshot(f.service,f.runtime);assert.equal(f.writes,0);assert.equal(f.marked,0);
 f.allowWrite=true;f.runtime.reader.getChainId=async()=>1;await processStakeSnapshot(f.service,f.runtime);assert.equal(f.writes,0);
 f.runtime.reader.getChainId=async()=>7794095;f.row.order.deadline='1';await processStakeSnapshot(f.service,f.runtime);assert.equal(f.writes,0);
 f.service.store.deployment.environment='local-fork';await processStakeSnapshot(f.service,f.runtime);assert.equal(f.writes,0);
});
test('worker refuses a reorged observation',async()=>{
 const f=fixture();const {snapshot}=await getStakeDetails(f.service,hash,f.runtime);
 f.local={...snapshot,blockHash:'0x'+'cc'.repeat(32)};
 await processStakeSnapshot(f.service,f.runtime);assert.equal(f.writes,0);assert.equal(f.marked,0);
});
