import test from 'node:test';
import assert from 'node:assert/strict';
import { stringToHex } from 'viem';
import { readFile } from 'node:fs/promises';
import { discoverArkiv,publishArkiv,arkivScope } from '../server/market/arkiv.ts';
import { serializeSale,parseSignedSale,SalesError } from '../src/lib/blend/sales.ts';
import { processPublication } from '../server/market/publication.ts';
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
 return {s,entity,stored,hash,deadline};
}
function runtime(entities=[]) {
 const calls=[];
 const q={where(value){calls.push(['where',value]);return this},ownedBy(value){calls.push(['owner',value]);return this},limit(){return this},offset(){return this},from(){return this},fetch:async()=>({entities})};
 return {calls,publisher:addr('3'),reader:{select:()=>q,getChainId:async()=>7794095},writer:{createEntity:async()=>{throw new Error('must not write')}}};
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
 const {s,entity,hash,deadline}=fixture(kind),r=runtime();let written,expiry,count=0;
 r.writer.createEntity=async(_schema,values,options)=>{written=values;expiry=options.expiration;count++;return {entityKey:entity.$key,txHash:'0xtx',expiresAt:123n}};
 r.reader.getEntity=async()=>entity;
 const receipt=await publishArkiv(s,hash,r);
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
 const {s,entity,hash}=fixture(),r=runtime();
 r.writer.createEntity=async()=>({entityKey:entity.$key,txHash:'0xtx',expiresAt:123n});
 r.reader.getEntity=async()=>({...entity,expires:{value:0n}});
 await assert.rejects(publishArkiv(s,hash,r),/could not be verified/);
});
