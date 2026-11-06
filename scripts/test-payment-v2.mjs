import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAbiParameters, parseUnits, recoverTypedDataAddress, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { paymentTokens, parsePaymentAmount, formatPaymentAmount, supportedPaymentTokens } from '../src/lib/blend/payment-tokens.ts';
import { zoneProof, seaportComponents, seaportTypedData, seaportOrderHash } from '../src/lib/blend/seaport.ts';
import { parseSalesDeployment, parseSignedSale, serializeSale } from '../src/lib/blend/sales.ts';
import { assertLegacyTradingRetired, legacySignatureDeployment } from '../src/lib/blend/sales-migration.ts';
import { fundingPath, quoteFundingInput, quoteWiseFunding, executeWiseFunding } from '../src/lib/blend/wise-funding.ts';
import { quotePurchaseFunding, validatePurchaseFunding } from '../src/lib/market/purchase-funding.ts';
import { sortEntries, filterEntries, emptyFilters } from '../src/lib/market/presentation.ts';
import { arkivQueryFilters } from '../src/lib/market/filter-query.ts';
const [wise,weth,usdc]=paymentTokens;
const d={...legacySignatureDeployment,paymentSchemaVersion:2};
const maker=privateKeyToAccount(`0x${'11'.repeat(32)}`);
const order={kind:0,maker:maker.address,owner:maker.address,collection:d.collection,currency:wise.address,tokenId:20n,stakeId:`0x${'12'.repeat(16)}`,stateHash:`0x${'34'.repeat(32)}`,amount:100n*10n**18n,nonce:1n,epoch:0n,counter:0n,startTime:1000n,deadline:1000n+86400n,feeBps:d.feeBps,feeRecipient:d.feeRecipient};
const entry=(token,amount)=>({row:{order:{...serializeSale(order),currency:token.address,amount:String(parseUnits(amount,token.decimals))}}});

test('V2 currency is bound into both proof and Seaport signature; V1 remains WISE-only',async()=>{
 assert.equal((zoneProof(order).length-2)/2,288);
 for(const token of paymentTokens){
  const o={...order,currency:token.address,amount:parsePaymentAmount('20',token.address)};
  assert.equal((zoneProof(o,2).length-2)/2,320);
  assert.equal(decodeAbiParameters([{type:'address'}],`0x${zoneProof(o,2).slice(-64)}`)[0].toLowerCase(),token.address.toLowerCase());
  const signature=await maker.signTypedData(seaportTypedData(d,o));
  assert.equal(parseSignedSale({order:serializeSale(o),signature},d).hash,seaportOrderHash(d,o));
  for(const other of paymentTokens.filter(t=>t!==token))
   assert.notEqual(await recoverTypedDataAddress({...seaportTypedData(d,{...o,currency:other.address}),signature}),maker.address);
 }
 for(const token of [weth,usdc])assert.throws(()=>seaportComponents(legacySignatureDeployment,{...order,currency:token.address}));
 assert.throws(()=>parseSalesDeployment({...d,paymentSchemaVersion:3}));
 assert.deepEqual(supportedPaymentTokens(legacySignatureDeployment).map(t=>t.symbol),['WISE']);
 assert.deepEqual(supportedPaymentTokens(d).map(t=>t.symbol),['WISE','WETH','USDC']);
});
test('USDC amounts retain six-decimal precision, reject rounding and group thousands',()=>{
 assert.equal(parsePaymentAmount('1000.123456',usdc.address),1000123456n);
 assert.equal(formatPaymentAmount(1000123456n,usdc.address),'1,000.123456');
 for(const value of ['0','-1','1e3','1.1234567','NaN','1,000'])assert.throws(()=>parsePaymentAmount(value,usdc.address));
 assert.equal(parsePaymentAmount('0.000000000000000001',weth.address),1n);
});
test('price filters use the selected currency and mixed prices sort by USD, never raw units',()=>{
 const entries=[entry(usdc,'20'),entry(wise,'100'),entry(weth,'0.01')];
 const prices={WISE:.12,WETH:3000,USDC:1};
 assert.deepEqual(sortEntries(entries,'price','asc',prices).map(e=>e.row.order.currency),[wise.address,usdc.address,weth.address]);
 assert.deepEqual(sortEntries(entries,'price','desc',prices).map(e=>e.row.order.currency),[weth.address,usdc.address,wise.address]);
 const filters={...emptyFilters,currency:usdc.address,minPrice:'10',maxPrice:'25'};
 assert.deepEqual(arkivQueryFilters(filters),{currency:usdc.address,minPrice:'10000000',maxPrice:'25000000'});
 assert.equal(filterEntries(entries,filters).length,1);
 // Unknown-price currencies stay last and deterministic in either direction.
 assert.equal(sortEntries(entries,'price','desc',{WISE:.12})[0].row.order.currency,wise.address);
});
test('V2 cannot open while V1 trades; V1 cancellation is independent of this guard',async()=>{
 const client={getCode:async()=> '0x1234',readContract:async()=>true};
 await assert.rejects(assertLegacyTradingRetired(client,d),/previous validator/);
 await assertLegacyTradingRetired({},legacySignatureDeployment);
});
test('funding routes cover payment currencies and ETH wraps directly into WETH',async()=>{
 assert.deepEqual(fundingPath(wise.address,usdc.address),[wise.address,weth.address,usdc.address]);
 assert.deepEqual(fundingPath(usdc.address,weth.address),[usdc.address,weth.address]);
 assert.deepEqual(fundingPath(zeroAddress,weth.address),[weth.address]);
 assert.throws(()=>fundingPath(usdc.address,usdc.address));
 const client={getChainId:async()=>1,getBlockNumber:async()=>1n};
 assert.equal(await quoteFundingInput(client,zeroAddress,123n,50,weth.address),123n);
 const swap=await quoteWiseFunding(client,zeroAddress,123n,50,weth.address);
 assert.equal(swap.minimum,123n);
 const q=await quotePurchaseFunding(client,{token:zeroAddress,currency:weth.address,buyer:maker.address,orderHash:`0x${'11'.repeat(32)}`,price:200n,balance:77n,slippage:50});
 validatePurchaseFunding(q,maker.address,q.orderHash,123n,weth.address);
 assert.throws(()=>validatePurchaseFunding(q,maker.address,q.orderHash,123n,usdc.address),/cannot cover/);
 const writes=[];
 await executeWiseFunding({client:{...client,getBalance:async()=>1000n,simulateContract:async r=>({request:r}),waitForTransactionReceipt:async()=>({status:'success'})},wallet:{account:maker,chain:{id:1},getChainId:async()=>1,writeContract:async r=>{writes.push(r);return `0x${'22'.repeat(32)}`;}},address:maker.address,guard:async()=>{},onStep:()=>{},onHash:()=>{}},swap);
 assert.equal(writes.length,1);assert.equal(writes[0].address,weth.address);assert.equal(writes[0].functionName,'deposit');assert.equal(writes[0].value,123n);
});
