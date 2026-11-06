import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress} from 'viem';
import {readFile} from 'node:fs/promises';
import {maximumPaymentInput,validatePurchasePayment} from '../src/lib/market/purchase-payment.ts';
import {FUNDING_WISE,FUNDING_WETH} from '../src/lib/blend/wise-funding.ts';
const original=JSON.parse(await readFile(new URL('./fixtures/signature-market.json',import.meta.url)));
const buyer='0x1111111111111111111111111111111111111111',router='0x2222222222222222222222222222222222222222',codeHash=`0x${'ab'.repeat(32)}`,orderHash=`0x${'cd'.repeat(32)}`;
const d={...original,paymentSchemaVersion:2,purchaseRouter:{address:router,codeHash}};
const quote=()=>({buyer,router,routerCodeHash:codeHash,orderHash,chainId:1,currency:FUNDING_WISE,amount:2000n,inputToken:zeroAddress,estimatedInput:1000n,maxInput:1005n,slippage:50,expires:Date.now()+120000});
const check=q=>validatePurchasePayment(q,d,buyer,orderHash,FUNDING_WISE,2000n);
test('exact-output payment limits round upwards, including tiny base units',()=>{
 assert.equal(maximumPaymentInput(1001n,50),1007n);assert.equal(maximumPaymentInput(1n,10),2n);
 for(const bps of [-1,0,5,301,0.5,NaN])assert.throws(()=>maximumPaymentInput(1000n,bps));
 assert.throws(()=>maximumPaymentInput(0n,50));check(quote());
});
test('payment quotes bind buyer, listing, network, router, currency, amount and maximum',()=>{
 for(const mutation of [{buyer:zeroAddress},{router:zeroAddress},{routerCodeHash:orderHash},{orderHash:codeHash},{chainId:10},{currency:FUNDING_WETH},{amount:2001n},{maxInput:1006n},{maxInput:1004n},{expires:0},{inputToken:buyer}])assert.throws(()=>check({...quote(),...mutation}),/quote|token/i);
 assert.throws(()=>validatePurchasePayment(quote(),original,buyer,orderHash,FUNDING_WISE,2000n));
});
test('ETH wrapping pays exact WETH without adding a slippage buffer',()=>{
 const q={...quote(),currency:FUNDING_WETH,estimatedInput:2000n,maxInput:2000n};
 validatePurchasePayment(q,d,buyer,orderHash,FUNDING_WETH,2000n);
 assert.throws(()=>validatePurchasePayment({...q,maxInput:2001n},d,buyer,orderHash,FUNDING_WETH,2000n));
});
