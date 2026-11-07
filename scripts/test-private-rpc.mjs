import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { toFunctionSelector } from 'viem';
import { createPrivateReadSession, restrictedBootstrap, NYM_SPECIFIER, PRIVATE_RPC_ENDPOINT } from '../src/lib/private-rpc.ts';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(options={}) {
 const calls=[];let starts=0,closed=0;
 const worker={ready:Promise.resolve(),close:()=>{closed++},fetch:async(url,init)=>{
  const request=JSON.parse(init.body);calls.push({url,init,request});
  return Response.json({jsonrpc:'2.0',id:request.id,result:request.method==='eth_chainId'?'0x1':request.method==='eth_blockNumber'?'0x1234':'0x2'});
 }};
 const session=createPrivateReadSession({createWorker:async()=>{starts++;return worker},...options});
 return {worker,session,calls,get starts(){return starts},get closed(){return closed}};
}
test('private requests share one verified worker and never pass cookies or referrers',async()=>{
 const f=fixture();
 const [balance,block]=await Promise.all([f.session.request({method:'eth_getBalance',params:['0x'+'11'.repeat(20),'latest']}),f.session.request({method:'eth_blockNumber'})]);
 assert.equal(balance,'0x2');assert.equal(block,'0x1234');assert.equal(f.starts,1);
 assert.equal(f.calls.filter(c=>c.request.method==='eth_chainId').length,1);
 assert.equal(f.session.getSnapshot().block,'4660');
 for(const {url,init} of f.calls){assert.equal(url,PRIVATE_RPC_ENDPOINT);assert.equal(init.credentials,'omit');assert.equal(init.referrerPolicy,'no-referrer');assert.equal(init.redirect,'error')}
 f.session.reset();assert.equal(f.closed,1);
});
test('signing, wallet access and transaction methods are rejected before worker creation',async()=>{
 const f=fixture();
 for(const method of ['eth_sendRawTransaction','eth_sendTransaction','eth_sign','personal_sign','wallet_switchEthereumChain','eth_accounts'])
  await assert.rejects(f.session.request({method}),/reads only/);
 assert.equal(f.starts,0);
});
test('direct bootstrap only accepts mainnet chain ID and exact public specifier getters',async()=>{
 const calls=[];
 const bootstrap=restrictedBootstrap(async(url,init)=>{const req=JSON.parse(init.body);calls.push({url,init,req});return Response.json({jsonrpc:'2.0',id:req.id,result:'0x1'})});
 await bootstrap.request({method:'eth_chainId'});
 for(const name of ['workerHash()','workerResolvers()'])await bootstrap.request({method:'eth_call',params:[{to:NYM_SPECIFIER,data:toFunctionSelector(name)},'latest']});
 for(const args of [{method:'eth_getBalance',params:['0x'+'11'.repeat(20),'latest']},
  {method:'eth_chainId',params:['unexpected']},
  {method:'eth_call',params:[{to:NYM_SPECIFIER,data:'0x12345678'},'latest']},
  {method:'eth_call',params:[{to:NYM_SPECIFIER,data:toFunctionSelector('workerHash()'),from:'0x'+'11'.repeat(20)},'latest']},
  {method:'eth_call',params:[{to:'0x'+'11'.repeat(20),data:toFunctionSelector('workerHash()')},'latest']}])
  await assert.rejects(bootstrap.request(args),/Only public/);
 assert.equal(calls.length,3);assert.ok(calls.every(c=>c.init.credentials==='omit'));
});
test('wrong chain stops startup before a wallet-specific read is sent',async()=>{
 const f=fixture();f.worker.fetch=async(_url,init)=>Response.json({jsonrpc:'2.0',id:JSON.parse(init.body).id,result:'0xaa36a7'});
 await assert.rejects(f.session.request({method:'eth_getBalance',params:['0x'+'11'.repeat(20),'latest']}),/No direct fallback/);
 assert.equal(f.session.getSnapshot().phase,'error');assert.equal(f.closed,1);
});
test('transport failure fails closed and does not retry without an explicit reset',async()=>{
 const f=fixture();f.worker.fetch=async()=>{throw Error('https://private-provider.invalid?secret=do-not-display')};
 await assert.rejects(f.session.request({method:'eth_blockNumber'}),e=>!e.message.includes('do-not-display')&&/No direct fallback/.test(e.message));
 await assert.rejects(f.session.request({method:'eth_blockNumber'}));assert.equal(f.starts,1);
 f.session.reset();await assert.rejects(f.session.request({method:'eth_blockNumber'}));assert.equal(f.starts,2);
});
test('startup timeout closes a late worker and cannot set a stale ready state',async()=>{
 let close=0;const session=createPrivateReadSession({startupMs:10,createWorker:async()=>{await pause(30);return {ready:Promise.resolve(),close:()=>close++,fetch:async()=>{throw Error('Should not fetch')}}}});
 await assert.rejects(session.request({method:'eth_blockNumber'}),/No direct fallback/);await pause(40);
 assert.equal(close,1);assert.equal(session.getSnapshot().phase,'error');
});
test('reset aborts in-flight reads and prevents their stale result from being applied',async()=>{
 const f=fixture();await f.session.request({method:'eth_blockNumber'});
 let release;f.worker.fetch=(_url,init)=>new Promise(resolve=>{release=()=>resolve(Response.json({jsonrpc:'2.0',id:JSON.parse(init.body).id,result:'0x999'}))});
 const pending=f.session.request({method:'eth_blockNumber'});await pause(0);f.session.reset();
 await assert.rejects(pending);release();await pause(0);assert.equal(f.session.getSnapshot().phase,'idle');
});
test('RPC IDs and results are checked; oversized responses are rejected',async()=>{
 for(const bad of ['id','result','size']){
  const f=fixture();await f.session.request({method:'eth_blockNumber'});
  f.worker.fetch=async(_url,init)=>{const req=JSON.parse(init.body);return bad==='size'?new Response('x'.repeat(5_000_001)):Response.json({jsonrpc:'2.0',id:bad==='id'?req.id+1:req.id,...(bad==='id'?{result:'0x2'}:{})})};
  await assert.rejects(f.session.request({method:'eth_getCode'}));assert.equal(f.session.getSnapshot().phase,'error');
 }
});
test('EVM revert code and data survive without exposing arbitrary provider errors',async()=>{
 const f=fixture();await f.session.request({method:'eth_blockNumber'});
 f.worker.fetch=async(_url,init)=>Response.json({jsonrpc:'2.0',id:JSON.parse(init.body).id,error:{code:3,message:'provider secret',data:'0xdeadbeef'}});
 await assert.rejects(f.session.request({method:'eth_call'}),e=>e.code===3&&e.data==='0xdeadbeef'&&!e.message.includes('secret'));
 assert.equal(f.session.getSnapshot().phase,'ready');f.session.reset();
});
test('the actual app transport does not send balance reads to direct fallbacks when Nym fails',async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 let mode='nym';globalThis.localStorage={getItem:()=>mode};
 const direct=[];globalThis.fetch=async (_url,init)=>{const req=JSON.parse(init.body);direct.push(req.method);throw Error('Bootstrap offline')};
 const {readRpcTransport}=await import('./src/lib/rpc-failover.ts');
 const transport=readRpcTransport(1)({});
 await assert.rejects(transport.request({method:'eth_getBalance',params:['0x'+'11'.repeat(20),'latest']}));
 assert.deepEqual(direct,['eth_chainId']);
 mode='direct';
 await assert.rejects(readRpcTransport(1)({}).request({method:'eth_getBalance',params:['0x'+'22'.repeat(20),'latest']}));
 assert.deepEqual(direct,['eth_chainId'],'saved changes must not mix transport modes until reload');
 console.log('fail-closed app routing passed');
 `],{cwd:new URL('../',import.meta.url)});
 assert.match(stdout,/fail-closed app routing passed/);
});

test('standalone Nym failure never leaks the wallet read to fetch or the external wallet',async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 const direct=[];let walletCalls=0;
 globalThis.fetch=async (_url,init)=>{const req=JSON.parse(init.body);direct.push(req);throw Error('Bootstrap offline')};
 const {backupReadTransport}=await import('./src/lib/backup/connection.ts');
 const transport=backupReadTransport({selection:'nym',provider:{request:async()=>{walletCalls++;return '0x1'}}})({});
 const request={method:'eth_getBalance',params:['0x'+'11'.repeat(20),'latest']};
 await assert.rejects(transport.request(request));
 await assert.rejects(transport.request(request));
 assert.deepEqual(direct.map(r=>r.method),['eth_chainId']);
 assert.deepEqual(direct[0].params,[]);assert.equal(walletCalls,0);
 console.log('fail-closed backup routing passed');
 `],{cwd:new URL('../',import.meta.url)});
 assert.match(stdout,/fail-closed backup routing passed/);
});
