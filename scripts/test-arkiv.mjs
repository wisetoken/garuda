import test from 'node:test';
import assert from 'node:assert/strict';
import { stringToHex, bytesToHex } from 'viem';
import { readFile } from 'node:fs/promises';
import { discoverArkiv,publishArkiv,arkivLifetime,extendArkiv,extendOfferMessage,arkivScope } from '../server/market/arkiv.ts';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { serializeSale,parseSignedSale,SalesError } from '../src/lib/blend/sales.ts';
import { processPublication } from '../server/market/publication.ts';
import { orderAttributes, parseOrderEntity, ArkivListings } from '../server/market/arkiv-schema.ts';
import { parseArkivFilters, orderFilters } from '../server/market/arkiv-filters.ts';
import { render } from '@arkiv-network/sdk/query';
const d=JSON.parse(await readFile(new URL('./fixtures/signature-market.json',import.meta.url),'utf8'));
const addr=b=>`0x${b.repeat(40)}`;
function fixture(kind=0) {
 const deadline=BigInt(Math.floor(Date.now()/1000)+3600);
 const signed={signature:'0x1234',order:serializeSale({kind,maker:addr('1'),owner:kind?addr('2'):addr('1'),collection:d.collection,currency:d.currency,
  tokenId:53n,stakeId:`0x${'55'.repeat(16)}`,stateHash:`0x${'66'.repeat(32)}`,amount:1000n,nonce:1n,epoch:0n,counter:0n,
  startTime:deadline-7200n,deadline,feeBps:d.feeBps,feeRecipient:d.feeRecipient})};
 const {hash}=parseSignedSale(signed,d);
 const entity={$key:`0x${'aa'.repeat(32)}`,envelope:{value:stringToHex(JSON.stringify(signed))},orderHash:{value:hash},scope:{value:arkivScope(d)},
  kind:{value:kind?'bid':'listing'},maker:{value:signed.order.maker.toLowerCase()},owner:{value:signed.order.owner.toLowerCase()},
  collection:{value:d.collection.toLowerCase()},tokenId:{value:'53'},expires:{value:deadline},format:{value:'seaport-1.6'}};
 const stored={...signed,hash,publishedBlock:'99',publishedBlockHash:'0xoriginal'};
 const s={store:{deployment:d,limit:async()=>true,activity:async()=>[],get:async()=>stored,transaction:fn=>fn({query:async()=>({rows:[{locked:true}]})})},
  snapshot:async()=>({number:100n,hash:'0xabc'}),client:{getBlock:async()=>({hash:'0xabc'})},
  status:async row=>({...row,status:'available'}),get:async()=>({...stored,status:'available'})};
 const snapshot={version:1,chainId:1,blockNumber:'100',blockHash:`0x${'bb'.repeat(32)}`,observedAt:Number(deadline)-3600,
 collection:d.collection,owner:signed.order.owner,tokenId:'53',stakeId:signed.order.stakeId,principal:String(1000n*10n**18n),shares:String(2n**120n),
 startAt:100,maturesAt:31536100,status:'Active',canList:true,unclaimedInterest:'5',
 displayStake:{id:signed.order.stakeId,stakedAmount:String(1000n*10n**18n),stakesShares:String(2n**120n),startDay:'1',lockDays:'365',closeDay:'0',
 rewardAmount:'5',penaltyAmount:'0',scrapedAmount:'0',createdAtTimestamp:'100',closedAtTimestamp:'0',isActive:true}};
 const metadata={snapshot,publishedAt:Number(deadline)-7200,indexedAt:Number(deadline)-3600};
 const v2={$key:entity.$key,...Object.fromEntries(Object.entries(orderAttributes(stored,d,metadata)).map(([k,v])=>[k,
 typeof v==='string'?{value:v}:v instanceof Uint8Array?{value:bytesToHex(v)}:v]))};
 return {s,entity,stored,hash,deadline,metadata,v2};
}
function runtime(entities=[]) {
 const calls=[];
 const reader={select:()=>{
   let schema;
   const q={where(value){calls.push(['where',value]);return this},ownedBy(value){calls.push(['owner',value]);return this},
     orderBy(value){calls.push(['orderBy',value]);return this},limit(){return this},offset(){return this},from(value){schema=value;return this},
     fetch:async()=>({entities:entities.filter(e=>Boolean(e.price)===(schema?.name==='wiseone.garuda.orders.v2'))})};
   return q;
 },getChainId:async()=>7794095};
 return {calls,publisher:addr('3'),reader,writer:{createEntity:async()=>{throw new Error('must not write')}}};
}
for(const kind of [0,1]) test(`Arkiv discovers ${kind?'bids':'listings'} and preserves original publication anchor`,async()=>{
 const {s,entity}=fixture(kind),r=runtime([entity,entity]);
 const result=await discoverArkiv(s,{kind:kind?'bid':'listing'},r);
 assert.equal(result.orders.length,1);assert.equal(result.source,'arkiv');assert.equal(result.orders[0].publishedBlockHash,'0xoriginal');
 assert.equal(result.orders[0].arkivEntity,entity.$key);assert.ok(r.calls.some(([k,v])=>k==='owner'&&v===r.publisher));
 s.status=async row=>({...row,status:'transferred'});
 assert.equal((await discoverArkiv(s,{},r)).orders[0].status,'transferred');
 s.store.get=async()=>null;assert.deepEqual((await discoverArkiv(s,{},r)).orders,[]);
});
for(const field of ['scope','kind','maker','owner','collection','tokenId','expires','envelope','format']) test(`rejects malformed or mismatched ${field}`,async()=>{
 const {s,entity}=fixture();entity[field]={value:field==='expires'?0n:field==='envelope'?'0x00':'wrong'};
 assert.deepEqual((await discoverArkiv(s,{},runtime([entity]))).orders,[]);
});
test('does not disguise Arkiv outages as database results',async()=>{
 const {s}=fixture(),r=runtime();r.reader.select=()=>{throw new Error('RPC down')};
 await assert.rejects(discoverArkiv(s,{},r),/RPC down/);
});
test('rejects wrong network, invalid pagination and canonical chain change',async()=>{
 const {s}=fixture(),r=runtime();r.reader.getChainId=async()=>1;
 await assert.rejects(discoverArkiv(s,{},r),/Rabdi/);
 await assert.rejects(publishArkiv(s,'0xhash',r),/Rabdi/);
 await assert.rejects(discoverArkiv(s,{before:'-1'},runtime()),/page/);
 s.client.getBlock=async()=>({hash:'changed'});
 await assert.rejects(discoverArkiv(s,{},runtime()),/Chain changed/);
});
for(const kind of [0,1]) test(`publishes ${kind?'bid':'listing'} with signed expiry, then deduplicates retries`,async()=>{
 const {s,v2:entity,hash,deadline,metadata}=fixture(kind),r=runtime();let written,expiry,count=0;
 r.writer.createEntity=async(_schema,values,options)=>{written=values;expiry=options.expiration;count++;return {entityKey:entity.$key,txHash:'0xtx',expiresAt:123n}};
 r.reader.getEntity=async()=>entity;
 const receipt=await publishArkiv(s,hash,r,async()=>metadata);
 assert.equal(written.kind,kind?'bid':'listing');assert.equal(written.expires.value,deadline);
 assert.equal(expiry.expiresAt.getTime(),Number(deadline)*1000);
 assert.equal(receipt.expiresAt,'123');assert.doesNotThrow(()=>JSON.stringify(receipt));
 const existing=runtime([entity]);existing.writer=r.writer;existing.reader.getEntity=r.reader.getEntity;
 assert.equal((await publishArkiv(s,hash,existing)).created,false);assert.equal(count,1);
});
test('refuses forks and unavailable orders before spending testnet gas',async()=>{
 const {s,hash}=fixture();s.store.deployment={...d,environment:'local-fork'};
 await assert.rejects(publishArkiv(s,hash,runtime()),/Only Ethereum/);
 s.store.deployment=d;s.get=async()=>({status:'expired'});
 await assert.rejects(publishArkiv(s,hash,runtime()),/expired/);
});
test('publication queue retries transient failure and stops invalidated orders',async()=>{
 const {s}=fixture();const writes=[];
 s.store.pool={query:async(sql,params)=>{if(sql.includes('RETURNING hash'))return {rows:[{hash:'h',attempts:2}]};writes.push(params);return {rows:[]}}};
 await processPublication(s,runtime(),async()=>{throw new Error('RPC down')});
 assert.equal(writes[0][2],'retrying');assert.equal(writes[0][4],60);
 await processPublication(s,runtime(),async()=>{throw new SalesError('order-unavailable','Order is expired.')});
 assert.equal(writes[1][2],'unavailable');
 await processPublication(s,runtime(),async()=>({entityKey:'entity',txHash:'tx'}));
 assert.equal(writes[2][2],'entity');
});

test('missing attributes are ignored without hiding other valid orders',async()=>{
 const {s,entity}=fixture();const missing={...entity};delete missing.scope;
 assert.equal((await discoverArkiv(s,{},runtime([missing,entity]))).orders.length,1);
});
test('write read-back must preserve the signed envelope and expiry',async()=>{
 const {s,v2:entity,hash,metadata}=fixture(),r=runtime();
 r.writer.createEntity=async()=>({entityKey:entity.$key,txHash:'0xtx',expiresAt:123n});
 r.reader.getEntity=async()=>({...entity,expires:{value:0n}});
 await assert.rejects(publishArkiv(s,hash,r,async()=>metadata),/could not be verified/);
});

for (const kind of [0,1]) test(`v2 ${kind?'bid':'listing'} preserves exact amounts, snapshots and signer identity`,async()=>{
 const {s,v2,metadata}=fixture(kind);
 const parsed=parseOrderEntity(v2,d,2);
 assert.equal(v2.price.value,BigInt(parsed.signed.order.amount));
 assert.equal(v2.shares.value,2n**120n); assert.equal(v2.principal.value,1000n*10n**18n);
 assert.equal(v2.stakeStartAt.value,BigInt(metadata.snapshot.startAt));
 assert.equal((await discoverArkiv(s,{},runtime([v2]))).orders.length,1);
});
for (const field of ['price','currency','chainId','principal','shares','maturesAt','stakeOwner','stateHash','publishedAt','snapshot'])
 test(`v2 rejects inconsistent ${field}`,()=>{
  const {v2}=fixture(); const broken={...v2,[field]:{value:typeof v2[field].value==='bigint'?0n:'wrong'}};
  assert.throws(()=>parseOrderEntity(broken,d,2));
 });
test('legacy pagination avoids duplicate v2 orders and retains legacy-only orders',async()=>{
 const {s,entity,v2}=fixture();
 assert.equal((await discoverArkiv(s,{before:'v1:0'},runtime([entity,v2]))).orders.length,0);
 assert.equal((await discoverArkiv(s,{before:'v1:0'},runtime([entity]))).orders.length,1);
 assert.deepEqual((await discoverArkiv(s,{before:'v1:0',minPrice:'10'},runtime([entity]))).orders,[]);
});
test('typed price/share ranges do not round large values and reject unsafe filters',()=>{
 const amount=String(2n**200n);
 const filters=parseArkivFilters({kind:'bid',minPrice:amount,maxPrice:amount,minShares:amount,maturesAfter:'100',sort:'price',direction:'desc'});
 const query=render(orderFilters(d,filters),ArkivListings);
 assert.ok(query.includes(amount)); assert.ok(query.includes('u256('));
 for(const input of [{minPrice:'1.5'},{minPrice:'-1'},{minPrice:String(2n**256n)},{minPrice:'9',maxPrice:'1'},
  {maturesAfter:String(2n**64n)},{stakeOwner:'bad'},{kind:'offer'},{sort:'price;drop'},{before:'v1:-1'}]) assert.throws(()=>parseArkivFilters(input));
});
test('order that becomes unavailable during metadata reads is never published',async()=>{
 const {s,hash,metadata}=fixture();let count=0;
 s.get=async()=>({...(await s.store.get()),status:++count===1?'available':'sold'});
 await assert.rejects(publishArkiv(s,hash,runtime(),async()=>metadata),/sold/);
});

test('Arkiv discovery includes stake metadata and checks independent rows concurrently',async()=>{
 const a=fixture(0),b=fixture(1);let active=0,peak=0;
 a.s.store.get=async hash=>hash===a.hash?a.stored:b.stored;
 a.s.status=async row=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,10));active--;return {...row,status:'available'}};
 const result=await discoverArkiv(a.s,{},runtime([a.v2,b.v2]));
 assert.equal(peak,2);assert.equal(result.orders.length,2);
 assert.equal(result.orders[0].stakeSnapshot.principal,a.metadata.snapshot.principal);
 assert.equal(result.orders[1].hash,b.hash);
});

test('indexed preview renders snapshots without Ethereum checks and cannot grant availability',async()=>{
 const {s,v2,metadata}=fixture();
 s.snapshot=async()=>{throw Error('Preview must not wait on Ethereum')};
 s.status=s.snapshot;s.client.getBlock=s.snapshot;
 const result=await discoverArkiv(s,{},runtime([v2]),true);
 assert.equal(result.orders.length,1);assert.equal(result.orders[0].status,'checking');
 assert.equal(result.orders[0].stakeSnapshot.principal,metadata.snapshot.principal);
 assert.equal(result.blockNumber,'');assert.equal(result.blockHash,undefined);
});

test('only the stake owner can extend the Arkiv entity',async()=>{
 const {s,v2,hash}=fixture();
 const stranger=privateKeyToAccount(generatePrivateKey());
 const signature=await stranger.signMessage({message:extendOfferMessage(hash,v2.$key, Math.floor(Date.now()/1000)+30*86400)});
 let called=false;
 const r=runtime([v2]);
 r.writer.extendEntity=async()=>{called=true};
 r.reader.getEntity=async()=>v2;
 await assert.rejects(extendArkiv(s,hash,v2.$key,signature,Math.floor(Date.now()/1000)+30*86400,r),/stake owner/);
 assert.equal(called,false);
 await assert.rejects(extendArkiv(s,hash,'not-a-key',signature,Math.floor(Date.now()/1000)+30*86400,r),/Invalid extension/);
});

test('owner signature extends Arkiv storage and leaves the signed order untouched',async()=>{
 const {s,v2,hash,stored}=fixture();
 const owner=privateKeyToAccount(generatePrivateKey());
 s.get=async()=>({...stored,status:'available',order:{...stored.order,owner:owner.address}});
 const target=Math.floor(Date.now()/1000)+30*86400;
 const signature=await owner.signMessage({message:extendOfferMessage(hash,v2.$key,target)});
 let extended;
 const r=runtime([v2]);
 r.writer.extendEntity=async params=>{extended=params;return {entityKey:v2.$key,txHash:'0xtx',expiresAt:99n}};
 r.reader.getEntity=async()=>v2;
 await assert.rejects(extendArkiv(s,hash,v2.$key,signature,target+86400,r),/stake owner/);
 await assert.rejects(extendArkiv(s,hash,v2.$key,signature,0,r),/90 days/);
 await assert.rejects(extendArkiv(s,hash,v2.$key,signature,target+100*86400,r),/90 days/);
 const receipt=await extendArkiv(s,hash,v2.$key,signature,target,r);
 assert.equal(receipt.entityKey,v2.$key);assert.equal(receipt.expiresAt,'99');
 assert.equal(extended.entityKey,v2.$key);
 assert.equal(extended.expiration.expiresAt.getTime(),target*1000);
 assert.equal(stored.order.deadline,s.store.get && (await s.store.get()).order.deadline);
});

test('storage expiry returns the Arkiv block, never the signed trading timestamp',async()=>{
 const {s,v2,hash}=fixture();
 const r=runtime([v2]);
 r.reader.getEntity=async()=>({...v2,$expiresAt:291974n});
 assert.deepEqual(await arkivLifetime(s,hash,v2.$key,r),{expiresBlock:'291974'});
 await assert.rejects(arkivLifetime(s,'0x'+'00'.repeat(32),v2.$key,r),/does not match/);
});

test('Arkiv RPC throttling is reported as rate limiting, not an empty market',async()=>{
 const {s}=fixture();const r=runtime();
 r.reader.getChainId=async()=>{throw {cause:{status:429}};};
 await assert.rejects(discoverArkiv(s,{},r,true),error=>error.code==='rate-limit' && /order catalog/.test(error.message));
});
