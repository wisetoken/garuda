import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {assertDeploymentReview} from '../src/lib/deployment-review.ts';
import {allowLocalDeployment,sourceOutcome,assertRuntime} from './local-deployment.ts';
const address='0x1111111111111111111111111111111111111111',data=`0x${'ab'.repeat(100)}`;
const review=()=>({kind:'zone',chainId:1,from:address,data,creationHash:keccak256(data),checkedAt:Date.now(),gas:'2000000',affordable:true});
test('wallet creation rejects stale, altered, wrong-wallet, wrong-chain or unaffordable reviews',()=>{
 assertDeploymentReview(review(),address,1,'zone');
 for(const mutation of [{checkedAt:0},{checkedAt:Date.now()+10000},{creationHash:keccak256('0x')},{from:'0x2222222222222222222222222222222222222222'},{kind:'router'},{chainId:10},{gas:'0'},{gas:'x'},{affordable:false}])assert.throws(()=>assertDeploymentReview({...review(),...mutation},address,1,'zone'));
 assert.throws(()=>assertDeploymentReview(review(),address,10,'zone'));
});
test('local deployment operations reject foreign origins, hosts and remote clients',()=>{
 assert.ok(allowLocalDeployment('127.0.0.1:3212','127.0.0.1','http://127.0.0.1:3212'));
 for(const args of [['attacker.test:3212','127.0.0.1',undefined],['127.0.0.1:3212','10.0.0.1',undefined],['127.0.0.1:3212','127.0.0.1','https://attacker.test']])assert.equal(allowLocalDeployment(...args),false);
});
test('source submission or one matching bytecode is not reported as verified',()=>{
 for(const value of [{verificationId:'ticket'},{runtimeMatch:'exact_match'},{runtimeMatch:'match',creationMatch:null},{runtimeMatch:'pending',creationMatch:'match'}])assert.equal(sourceOutcome(value),false);
 assert.equal(sourceOutcome({runtimeMatch:'exact_match',creationMatch:'exact_match'}),true);
});
test('runtime verification ignores only compiler-designated immutable slots',()=>{
 const artifact={deployedBytecode:{object:'0x11223344',immutableReferences:{one:[{start:1,length:1}]}}};
 assertRuntime('0x11ff3344',artifact);
 assert.throws(()=>assertRuntime('0x11ff3345',artifact));assert.throws(()=>assertRuntime('0x11ff33',artifact));
});

const {activationAllowed,assertActivationReview}=await import('../src/lib/deployment-review.ts');
const {encodeFunctionData}=await import('viem');
const guardian='0x1111111111111111111111111111111111111111',legacy='0x2222222222222222222222222222222222222222',validator='0x3333333333333333333333333333333333333333';
const activation=()=>({guardian,legacy,validator,legacyPaused:false,legacyPauseConfirmed:false,validatorPaused:true,sourcesVerified:true,apiReady:true});
const pauseData=value=>encodeFunctionData({abi:[{type:'function',name:'setNewActivityPaused',inputs:[{type:'bool'}],outputs:[],stateMutability:'nonpayable'}],functionName:'setNewActivityPaused',args:[value]});
const activationReview=action=>({action,chainId:1,from:guardian,to:action==='retire-v1'?legacy:validator,data:pauseData(action==='retire-v1'),gas:'50000',checkedAt:Date.now(),affordable:true});
test('activation requires source verification, configured API and confirmed V1 retirement',()=>{
 assert.equal(activationAllowed(activation(),'retire-v1'),true);
 assert.equal(activationAllowed(activation(),'activate-v2'),false);
 for(const mutation of [{sourcesVerified:false},{apiReady:false},{validatorPaused:false}]){
  assert.equal(activationAllowed({...activation(),...mutation},'retire-v1'),false);
  assert.equal(activationAllowed({...activation(),legacyPaused:true,legacyPauseConfirmed:true,...mutation},'activate-v2'),false);
 }
 assert.equal(activationAllowed({...activation(),legacyPaused:true},'activate-v2'),false);
 assert.equal(activationAllowed({...activation(),legacyPaused:true,legacyPauseConfirmed:true},'activate-v2'),true);
 assert.equal(activationAllowed({...activation(),legacyPaused:true},'retire-v1'),false);
});
test('activation wallet review binds exact guardian, chain, target and pause action',()=>{
 assertActivationReview(activationReview('retire-v1'),activation(),guardian,1,'retire-v1');
 const retired={...activation(),legacyPaused:true,legacyPauseConfirmed:true};
 assertActivationReview(activationReview('activate-v2'),retired,guardian,1,'activate-v2');
 for(const mutation of [{to:validator},{data:pauseData(false)},{from:legacy},{action:'activate-v2'},{chainId:10},{checkedAt:0},{checkedAt:Date.now()+10000},{gas:'0'},{gas:'oops'},{affordable:false}])assert.throws(()=>assertActivationReview({...activationReview('retire-v1'),...mutation},activation(),guardian,1,'retire-v1'));
 assert.throws(()=>assertActivationReview(activationReview('retire-v1'),activation(),legacy,1,'retire-v1'));
 assert.throws(()=>assertActivationReview(activationReview('retire-v1'),activation(),guardian,10,'retire-v1'));
 assert.throws(()=>assertActivationReview(activationReview('activate-v2'),activation(),guardian,1,'activate-v2'));
});
