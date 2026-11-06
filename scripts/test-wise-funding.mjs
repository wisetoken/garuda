import test from 'node:test';
import assert from 'node:assert/strict';
import { zeroAddress, parseEther } from 'viem';
import { fundingTargetWithBuffer, quoteFundingInput, fundingPath, minimumFundingOutput, FUNDING_WETH, FUNDING_WISE, fundingTokens, quoteWiseFunding, executeWiseFunding } from '../src/lib/blend/wise-funding.ts';
test('native and wrapped ETH route through the WISE pool; stablecoin has an extra hop',()=>{
 assert.deepEqual(fundingPath(zeroAddress),[FUNDING_WETH,FUNDING_WISE]);
 assert.deepEqual(fundingPath(fundingTokens[2].address),[fundingTokens[2].address,FUNDING_WETH,FUNDING_WISE]);
 assert.throws(()=>fundingPath(FUNDING_WISE));
});
test('minimum output rounds down and disallows unbounded slippage',()=>{
 assert.equal(minimumFundingOutput(10001n,50),9950n);
 assert.throws(()=>minimumFundingOutput(100n,10000));assert.throws(()=>minimumFundingOutput(1n,50));
});
test('wrong network is rejected before quote reads',async()=>{
 await assert.rejects(quoteWiseFunding({getChainId:async()=>10},zeroAddress,1n),/mainnet/);
});
test('expired review cannot trigger approval or swap',async()=>{
 await assert.rejects(executeWiseFunding({guard:async()=>{},client:{getChainId:async()=>1},wallet:{getChainId:async()=>1,account:{address:zeroAddress}},address:zeroAddress},{expires:0}),/expired/);
});

test('shortfall buffer rounds up so slippage minimum still covers the target',()=>{
 for(const target of [1n,10001n,parseEther('42000')]) for(const bps of [10,50,100,300]) {
   assert.ok(minimumFundingOutput(fundingTargetWithBuffer(target,bps),bps)>=target);
 }
 assert.throws(()=>fundingTargetWithBuffer(0n,50));
});
test('shortfall quote uses router getAmountsIn and rejects a different chain',async()=>{
 let call;
 const input=await quoteFundingInput({getChainId:async()=>1,readContract:async args=>{call=args;return [123n,1006n];}},zeroAddress,1000n,50);
 assert.equal(input,123n);assert.equal(call.functionName,'getAmountsIn');
 assert.equal(call.args[0],1006n);
 await assert.rejects(quoteFundingInput({getChainId:async()=>10},zeroAddress,1000n),/mainnet/);
});
