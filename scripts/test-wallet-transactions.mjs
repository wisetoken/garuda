import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAbi,decodeFunctionData} from 'viem';
import {directTransactionWallet} from '../src/lib/wallet-transactions.ts';
const address='0x1111111111111111111111111111111111111111';
const target='0x2222222222222222222222222222222222222222';
const hash=`0x${'aa'.repeat(32)}`;
const abi=parseAbi(['function approve(address,uint256) returns(bool)']);
function fixture() {
 const sent=[],signed=[];
 const signer={address,sendTransaction:async request=>{sent.push(request);return {transactionHash:hash}},signTypedData:async data=>{signed.push(data);return '0xab'}};
 const state={account:signer,chain:{id:1}};
 const wallet={getAccount:()=>state.account,getChain:()=>state.chain};
 return {sent,signed,state,client:directTransactionWallet(signer,wallet)};
}
test('contract writes go directly to the connected account with exact calldata and value',async()=>{
 const f=fixture();
 assert.equal(await f.client.writeContract({address:target,abi,functionName:'approve',args:[target,123n]}),hash);
 assert.equal(f.sent.length,1);
 assert.deepEqual(f.sent[0],{chainId:1,to:target,data:f.sent[0].data,value:0n});
 assert.deepEqual(decodeFunctionData({abi,data:f.sent[0].data}),{functionName:'approve',args:[target,123n]});
 const payable=parseAbi(['function deposit() payable']);
 await f.client.writeContract({address:target,abi:payable,functionName:'deposit',value:456n});
 assert.equal(f.sent[1].value,456n);
});
test('wallet/account/network changes block direct writes and signatures',async()=>{
 for(const mutation of [s=>s.account=undefined,s=>s.account={address:target},s=>s.chain={id:10}]){
  const f=fixture();mutation(f.state);
  await assert.rejects(f.client.writeContract({address:target,abi,functionName:'approve',args:[target,123n]}),/changed/);
  await assert.rejects(f.client.signTypedData({domain:{chainId:1}}),/changed/);
  assert.equal(f.sent.length,0);assert.equal(f.signed.length,0);
 }
 const f=fixture();
 await assert.rejects(f.client.writeContract({address:target,abi,functionName:'approve',args:[target,123n],account:target}),/does not match/);
 await assert.rejects(f.client.writeContract({address:target,abi,functionName:'approve',args:[target,123n],chain:{id:10}}),/does not match/);
 await assert.rejects(f.client.signTypedData({domain:{chainId:10}}),/does not match/);
});
test('wallet rejection propagates without resubmitting',async()=>{
 let attempts=0;
 const signer={address,sendTransaction:async()=>{attempts++;throw Error('User rejected')},signTypedData:async()=>{throw Error('User rejected')}};
 const client=directTransactionWallet(signer,{getAccount:()=>signer,getChain:()=>({id:1})});
 await assert.rejects(client.writeContract({address:target,abi,functionName:'approve',args:[target,123n]}),/User rejected/);
 assert.equal(attempts,1);
});
