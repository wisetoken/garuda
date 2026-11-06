import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {swarmConfig,uploadFile,verifyFile,sha256,boundedBody,PUBLIC_SWARM_GATEWAY} from '../server/media/swarm.ts';
import {prepareArtwork} from '../server/media/artwork.ts';
import {processMediaBackup,publishMediaManifest,mediaStatus,recoverPublishedMedia} from '../server/media/publication.ts';
import {arkivScope} from '../server/market/arkiv.ts';
import {swarmFileUrl,fetchSwarmImage} from '../src/lib/market/media.ts';
const d=JSON.parse(await readFile(new URL('./fixtures/signature-market.json',import.meta.url),'utf8'));
const config={mode:'bee',bee:'http://127.0.0.1:1633',gateway:'https://gateway.example',batch:'aa'.repeat(32),token:'test-only-token'};
const hash='0x'+'11'.repeat(32),blockHash='0x'+'bb'.repeat(32),stakeId='0x'+'55'.repeat(16);
function snapshot() {return {version:1,chainId:1,blockNumber:'100',blockHash,observedAt:Math.floor(Date.now()/1000),
 collection:d.collection,owner:'0x'+'22'.repeat(20),tokenId:'40',stakeId,principal:'32000000000000000000000',shares:'12345',
 startAt:1786838400,maturesAt:1944432000,status:'Active',canList:true,unclaimedInterest:'5',
 displayStake:{id:stakeId,stakedAmount:'32000000000000000000000',stakesShares:'12345',startDay:'1',lockDays:'1824',closeDay:'0',rewardAmount:'5',penaltyAmount:'0',scrapedAmount:'0',createdAtTimestamp:'100',closedAtTimestamp:'0',isActive:true}};}
function fixture() {
 const s=snapshot(), row={hash,status:'available',order:{collection:s.collection,owner:s.owner,tokenId:s.tokenId,stakeId}};
 const job={hash,attempts:1,state:'queued'};let uploads=0,publishes=0,failVerify=false;
 const query=async(sql,params=[])=>{
  if(sql.includes('RETURNING *'))return {rows:[{...job}]};
  if(sql.includes('pg_try_advisory'))return {rows:[{locked:true}]};
  for(const name of ['prepared','image','metadata'])if(sql.includes(`SET ${name}=$3`))job[name]=params[2];
  if(sql.includes("state='ready'")){job.state='ready';job.receipt=params[2];}
  if(sql.includes('SET state=$3'))job.state=params[2];
  return {rows:[]};
 };
 const service={get:async()=>row,client:{getBlock:async()=>({hash:blockHash})},store:{scope:'scope',deployment:d,pool:{query},limit:async()=>true,transaction:async fn=>fn({query})}};
 const deps={config,runtime:{writer:{},publisher:'0x'+'33'.repeat(20)},recover:async()=>null,readMetadata:async()=>({snapshot:s}),
 upload:async(_config,bytes)=>{uploads++;return {reference:sha256(bytes),sha256:sha256(bytes)};},
 verify:async()=>{if(failVerify)throw Error('Gateway unavailable');},publish:async()=>{publishes++;return '0x'+'44'.repeat(32);}};
 return {service,deps,job,row,get uploads(){return uploads},get publishes(){return publishes},set failVerify(v){failVerify=v}};
}
test('Swarm is opt-in; config never accepts embedded credentials or insecure remote endpoints',()=>{
 assert.equal(swarmConfig({}),null);
 assert.equal(swarmConfig({SWARM_MEDIA_ENABLED:'false',SWARM_BEE_URL:'bad'}),null);
 const env={SWARM_MEDIA_ENABLED:'true',SWARM_BEE_URL:config.bee,SWARM_GATEWAY_URL:config.gateway,SWARM_POSTAGE_BATCH_ID:config.batch};
 assert.equal(swarmConfig(env).batch,config.batch);
 for(const gateway of ['http://remote.example','https://name:secret@gateway.example','https://gateway.example?key=secret','javascript:alert(1)'])
  assert.throws(()=>swarmConfig({...env,SWARM_GATEWAY_URL:gateway}));
 assert.throws(()=>swarmConfig({...env,SWARM_POSTAGE_BATCH_ID:''}));
 assert.throws(()=>swarmFileUrl(config.gateway,'../../other'));
});
test('generated artwork is deterministic, self-contained, and rejects unrelated or stale snapshots',()=>{
 const s=snapshot(),row={hash,order:s};const a=prepareArtwork(row,s),b=prepareArtwork(row,s);
 assert.deepEqual(a,b);assert.match(a.svg,/<svg/);assert.doesNotMatch(a.svg,/(?:href|src)="https?:|<script|<foreignObject/);
 assert.equal(a.metadata.properties.observed_block_hash,blockHash);
 assert.throws(()=>prepareArtwork(row,{...s,tokenId:'41'}));
 assert.throws(()=>prepareArtwork(row,{...s,observedAt:s.observedAt-301}));
});
test('uploads are immediate, pinned and authenticated only to the Bee endpoint',async()=>{
 const body=new TextEncoder().encode('<svg/>');let sent;
 const file=await uploadFile(config,body,'image/svg+xml','artwork.svg',async(url,init)=>{sent={url,init};return Response.json({reference:'a'.repeat(64)});});
 assert.equal(sent.init.headers['swarm-deferred-upload'],'false');assert.equal(sent.init.headers['swarm-pin'],'true');
 assert.equal(sent.init.headers.Authorization,'Bearer test-only-token');assert.equal(sent.init.redirect,'error');
 assert.equal(file.sha256,sha256(body));
 await verifyFile(config,file,async(url,init)=>{
  assert.equal(url,`https://gateway.example/bzz/${file.reference}/`);assert.equal(init.headers,undefined);
  assert.equal(init.credentials,'omit');return new Response(body);
 });
 await assert.rejects(verifyFile(config,file,async()=>new Response('tampered')),/differs/);
 await assert.rejects(uploadFile(config,body,'image/svg+xml','x',async()=>Response.json({reference:'bad'})),/Invalid Swarm/);
 await assert.rejects(boundedBody(new Response(new Uint8Array(20)),10),/limit/);
});
test('browser verifies bytes and refuses a substituted image',async()=>{
 const bytes=new TextEncoder().encode('<svg/>'),file={reference:'b'.repeat(64),sha256:sha256(bytes)};
 const blob=await fetchSwarmImage(config.gateway,file,new AbortController().signal,async()=>new Response(bytes));
 assert.equal(blob.type,'image/svg+xml');assert.equal(await blob.text(),'<svg/>');
 await assert.rejects(fetchSwarmImage(config.gateway,file,new AbortController().signal,async()=>new Response('wrong')),/checksum/);
});
test('disabled backup worker does no network or database work',async()=>{
 const f=fixture();assert.equal(await processMediaBackup({}, {...f.deps,config:null}),false);assert.equal(f.uploads,0);
});
test('verified files and Arkiv reference are required before a backup becomes ready',async()=>{
 const f=fixture();f.failVerify=true;
 await processMediaBackup(f.service,f.deps);
 assert.equal(f.job.state,'retrying');assert.equal(f.publishes,0);assert.equal(f.uploads,2);
 const prepared=JSON.stringify(f.job.prepared);
 f.service.store.limit=async()=>{throw Error('A verification retry must not consume upload budget');};
 f.failVerify=false;await processMediaBackup(f.service,f.deps);
 assert.equal(f.uploads,2,'retry reuses both persisted upload references');
 assert.equal(JSON.stringify(f.job.prepared),prepared);
 assert.equal(f.job.state,'ready');assert.equal(f.publishes,1);assert.equal(f.job.receipt.observedBlockHash,blockHash);
 assert.ok(f.job.receipt.arkivEntity);
});
test('unavailable orders and reorged observations never upload',async()=>{
 for(const condition of ['expired','reorg']){
  const f=fixture();
  f.service.store.limit=async()=>{assert.fail('Unavailable orders must not consume upload budget');};
  if(condition==='expired')f.row.status='expired';else f.service.client.getBlock=async()=>({hash:'0x'+'cc'.repeat(32)});
  await processMediaBackup(f.service,f.deps);assert.equal(f.uploads,0);assert.equal(f.job.state,'unavailable');
 }
});
test('an Arkiv publication failure retains verified files for retry',async()=>{
 const f=fixture();f.deps.publish=async()=>{throw Error('Arkiv offline');};
 await processMediaBackup(f.service,f.deps);assert.equal(f.job.state,'retrying');assert.equal(f.uploads,2);assert.equal(f.job.receipt,undefined);
});
test('an existing media manifest must reference the exact uploaded files',async()=>{
 const f=fixture();await processMediaBackup(f.service,f.deps);const receipt=f.job.receipt;
 const saved={...receipt,image:{...receipt.image,reference:'f'.repeat(64)}};
 const chain={where(){return this},ownedBy(){return this},limit(){return this},fetch:async()=>({entities:[{$key:'0x'+'44'.repeat(32),manifest:{value:'0x'+Buffer.from(JSON.stringify(saved)).toString('hex')}}]})};
 const r={writer:{},publisher:'0x'+'33'.repeat(20),reader:{getChainId:async()=>7794095,select:()=>({from:()=>chain})}};
 await assert.rejects(publishMediaManifest(f.service,receipt,r),/differs/);
});
test('a ready receipt remains accessible when uploads are disabled',async()=>{
 const f=fixture();await processMediaBackup(f.service,f.deps);
 const store={scope:'scope',pool:{query:async()=>({rows:[{state:'ready',receipt:f.job.receipt}]})}};
 assert.equal((await mediaStatus(store,hash)).state,'ready');
});

test('public gateway supplies postage without pinning or forwarding private Bee configuration',async()=>{
 const env={SWARM_MEDIA_ENABLED:'true',SWARM_UPLOAD_MODE:'public-gateway'};
 const publicConfig=swarmConfig(env);
 assert.equal(publicConfig.bee,PUBLIC_SWARM_GATEWAY);assert.equal(publicConfig.gateway,PUBLIC_SWARM_GATEWAY);
 assert.equal(publicConfig.batch,'0'.repeat(64));assert.equal(publicConfig.token,undefined);
 for(const key of ['SWARM_BEE_URL','SWARM_POSTAGE_BATCH_ID','SWARM_BEE_API_TOKEN'])
  assert.throws(()=>swarmConfig({...env,[key]:'private'}),/Remove Bee/);
 assert.throws(()=>swarmConfig({...env,SWARM_UPLOAD_MODE:'typo'}),/Unknown/);
 await uploadFile({...publicConfig,token:'must-not-leak'},new TextEncoder().encode('<svg/>'),'image/svg+xml','artwork.svg',async(url,init)=>{
  assert.equal(url,`${PUBLIC_SWARM_GATEWAY}/bzz?name=artwork.svg`);
  assert.equal(init.headers['swarm-postage-batch-id'],'0'.repeat(64));
  assert.equal(init.headers['swarm-deferred-upload'],'false');
  assert.equal(init.headers['swarm-pin'],undefined);assert.equal(init.headers.Authorization,undefined);
  return Response.json({reference:'a'.repeat(64)});
 });
 const status=await mediaStatus({scope:'scope',pool:{query:async()=>({rows:[{state:'ready',receipt:{}}]})}},hash);
 assert.equal(status.gateway,process.env.SWARM_GATEWAY_URL || PUBLIC_SWARM_GATEWAY);
});
test('upload budget exhaustion retains the snapshot without uploading or publishing',async()=>{
 const f=fixture();f.service.store.limit=async()=>false;
 await processMediaBackup(f.service,f.deps);
 assert.equal(f.job.state,'retrying');assert.ok(f.job.prepared);assert.equal(f.uploads,0);assert.equal(f.publishes,0);
});

test('a fresh database restores a published backup without new uploads or Arkiv writes',async()=>{
 const original=fixture();await processMediaBackup(original.service,original.deps);
 const f=fixture();f.deps.recover=async()=>original.job.receipt;
 f.service.store.limit=async()=>assert.fail('Recovery must not consume upload budget');
 f.deps.readMetadata=async()=>assert.fail('Recovery must preserve the original observation');
 await processMediaBackup(f.service,f.deps);
 assert.equal(f.job.state,'ready');assert.deepEqual(f.job.receipt,original.job.receipt);
 assert.equal(f.uploads,0);assert.equal(f.publishes,0);
});
test('recovered backups require canonical provenance and successful file verification',async()=>{
 const original=fixture();await processMediaBackup(original.service,original.deps);
 for(const failure of ['reorg','gateway','arkiv']) {
  const f=fixture();f.deps.recover=async()=>{if(failure==='arkiv')throw Error('Arkiv offline');return original.job.receipt;};
  if(failure==='reorg')f.service.client.getBlock=async()=>({hash:'0x'+'cc'.repeat(32)});
  if(failure==='gateway')f.failVerify=true;
  await processMediaBackup(f.service,f.deps);
  assert.equal(f.job.state,failure==='reorg'?'unavailable':'retrying');
  assert.equal(f.job.receipt,undefined);assert.equal(f.uploads,0);assert.equal(f.publishes,0);
 }
});
test('Arkiv recovery accepts only the expected publisher, scope, order and valid receipt',async()=>{
 const f=fixture();await processMediaBackup(f.service,f.deps);
 const receipt=f.job.receipt, publisher=f.deps.runtime.publisher;
 const base={$key:receipt.arkivEntity,$owner:publisher,scope:{value:arkivScope(d)},orderHash:{value:hash},
  collection:{value:f.row.order.collection},tokenId:{value:'40'},renderer:{value:receipt.renderer},
  manifest:{value:'0x'+Buffer.from(JSON.stringify(receipt)).toString('hex')}};
 let entity=structuredClone(base);
 const chain={where(){return this},ownedBy(owner){assert.equal(owner,publisher);return this},limit(){return this},fetch:async()=>({entities:entity?[entity]:[]})};
 const runtime={publisher,reader:{getChainId:async()=>7794095,select:()=>({from:()=>chain})}};
 assert.deepEqual(await recoverPublishedMedia(f.service,f.row,runtime),receipt);
 for(const [key,value] of [['$owner','0x'+'55'.repeat(20)],['scope',{value:'wrong'}],['orderHash',{value:'0x'+'66'.repeat(32)}],['tokenId',{value:'41'}]]) {
  entity={...structuredClone(base),[key]:value};await assert.rejects(recoverPublishedMedia(f.service,f.row,runtime),/identity/);
 }
 for(const changed of [{tokenId:'41'},{chainId:2},{image:{...receipt.image,sha256:'invalid'}},{observedBlockHash:'invalid'}]) {
  entity={...base,manifest:{value:'0x'+Buffer.from(JSON.stringify({...receipt,...changed})).toString('hex')}};
  await assert.rejects(recoverPublishedMedia(f.service,f.row,runtime),/Invalid/);
 }
 entity=null;assert.equal(await recoverPublishedMedia(f.service,f.row,runtime),null);
});
