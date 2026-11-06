// Production codec, publication and settlement verification on a disposable local fork only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, defineChain, http, keccak256, parseAbi, parseEther, parseUnits, toHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { quotePurchasePayment, buyWithPayment } from '../src/lib/market/purchase-payment.ts';
import { purchaseFundingTokens } from '../src/lib/market/purchase-funding.ts';
import { advancedSale, seaportAbi, seaportComponents, seaportTypedData, saleSettlement, saleAmounts } from '../src/lib/blend/seaport.ts';
import { publishSale, fillSale, cancelSale, activateSalesMarket } from '../src/lib/blend/sales-wallet.ts';
import { parseSignedSale, parseSalesDeployment } from '../src/lib/blend/sales.ts';
import { verifySignedSale } from '../src/lib/blend/sales-chain.ts';
import { FUNDING_ROUTER, FUNDING_WETH, FUNDING_WISE, fundingTokens, fundingRouterAbi } from '../src/lib/blend/wise-funding.ts';
const rpcUrl = 'http://127.0.0.1:18751';
const chain = defineChain({id:31337,name:'Garuda V2 isolated fork',nativeCurrency:{name:'Fork ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpcUrl]}}});
const transport = http(rpcUrl, {timeout:60000,retryCount:0});
const client = createPublicClient({chain,transport,pollingInterval:100,cacheTime:0});
assert.match(await client.request({method:'web3_clientVersion'}), /anvil/i);
assert.equal(await client.getChainId(),31337);
const info = await client.request({method:'anvil_nodeInfo'});
assert.ok(info.forkConfig?.forkBlockNumber > 0);
const original = JSON.parse(await readFile(new URL('./fixtures/signature-market.json',import.meta.url)));
assert.equal(keccak256(await client.getCode({address:original.adapter})),original.adapterCodeHash);
const artifact = JSON.parse(await readFile(new URL('../contracts/seaport/out/GarudaSignatureSeaportZoneV2.sol/GarudaSignatureSeaportZoneV2.json',import.meta.url)));
const outer = await client.request({method:'evm_snapshot'});
const receipt = async hash => {const r=await client.waitForTransactionReceipt({hash,timeout:60000});assert.equal(r.status,'success');return r;};
const [guardian,seller,buyer] = Array.from({length:3},()=>createWalletClient({account:privateKeyToAccount(generatePrivateKey()),chain,transport}));
const nftAbi = parseAbi(['function ownerOf(uint256) view returns(address)','function safeTransferFrom(address,address,uint256)','function approve(address,uint256)']);
const erc20Abi = parseAbi(['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)']);
try {
  // A long-lived fork retains its old clock after snapshot rollback; keep quote deadlines representative.
  const current=await client.getBlock();
  await client.request({method:'evm_setNextBlockTimestamp',params:[Number(current.timestamp)>Math.floor(Date.now()/1000)?Number(current.timestamp)+1:Math.floor(Date.now()/1000)]});
  await client.request({method:'evm_mine'});
  for(const w of [guardian,seller,buyer]) await client.request({method:'anvil_setBalance',params:[w.account.address,toHex(parseEther('100'))]});
  const deployed = await receipt(await guardian.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object,args:[original.collection,original.currency,original.collectionCodeHash,original.currencyCodeHash,original.marketCodeHash,guardian.account.address,50n,original.feeRecipient]}));
  const zone=deployed.contractAddress;
  const readZone=(functionName,args=[])=>client.readContract({address:zone,abi:artifact.abi,functionName,args});
  assert.equal(await readZone('PAYMENT_SCHEMA_VERSION'),2n);
  assert.equal(await readZone('newActivityPaused'),true);
  const anchor=await client.getBlock({blockNumber:deployed.blockNumber});
  const deployment=parseSalesDeployment({...original,environment:'local-fork',chainId:31337,rpcUrl,
    adapter:zone,adapterCodeHash:keccak256(await client.getCode({address:zone})),guardian:guardian.account.address,
    deploymentBlock:String(deployed.blockNumber),deploymentBlockHash:anchor.hash,confirmations:1,paymentSchemaVersion:2});
  const session=wallet=>({client,wallet,deployment,address:wallet.account.address,assertWallet:async()=>{
    assert.equal(await client.getChainId(),31337);
  },validateSale:async signed=>assert.equal((await verifySignedSale(client,deployment,signed,await client.getBlock())).status,'available')});
  // The V2 application must refuse activation while the old validator can trade.
  await assert.rejects(activateSalesMarket(session(guardian),async()=>{}),/previous WISE market/);
  await client.request({method:'anvil_impersonateAccount',params:[original.guardian]});
  await client.request({method:'anvil_setBalance',params:[original.guardian,toHex(parseEther('10'))]});
  try {await receipt(await createWalletClient({account:original.guardian,chain,transport}).writeContract({address:original.adapter,abi:artifact.abi,functionName:'setNewActivityPaused',args:[true]}));}
  finally {await client.request({method:'anvil_stopImpersonatingAccount',params:[original.guardian]});}
  await activateSalesMarket(session(guardian),async()=>{});
  const routerArtifact = JSON.parse(await readFile(new URL('../contracts/seaport/out/GarudaPurchaseRouter.sol/GarudaPurchaseRouter.json',import.meta.url)));
  const routerReceipt = await receipt(await guardian.deployContract({abi:routerArtifact.abi,bytecode:routerArtifact.bytecode.object,args:[zone]}));
  const router = routerReceipt.contractAddress;
  deployment.purchaseRouter = {address:router,codeHash:keccak256(await client.getCode({address:router}))};
  const owner=id=>client.readContract({address:original.collection,abi:nftAbi,functionName:'ownerOf',args:[id]});
  for(const id of [20n,53n]) {
    const from=await owner(id);
    await client.request({method:'anvil_impersonateAccount',params:[from]});
    await client.request({method:'anvil_setBalance',params:[from,toHex(parseEther('10'))]});
    try {await receipt(await createWalletClient({account:from,chain,transport}).writeContract({address:original.collection,abi:nftAbi,functionName:'safeTransferFrom',args:[from,seller.account.address,id]}));}
    finally {await client.request({method:'anvil_stopImpersonatingAccount',params:[from]});}
  }
  const usdc=fundingTokens.find(t=>t.symbol==='USDC');
  for(const currency of [FUNDING_WISE,usdc.address]) {
    const deadline=(await client.getBlock()).timestamp+600n;
    await receipt(await buyer.writeContract({address:FUNDING_ROUTER,abi:fundingRouterAbi,functionName:'swapExactETHForTokens',args:[1n,[FUNDING_WETH,currency],buyer.account.address,deadline],value:parseEther('0.1')}));
  }
  await receipt(await buyer.writeContract({address:FUNDING_WETH,abi:parseAbi(['function deposit() payable']),functionName:'deposit',value:parseEther('0.1')}));
  let nonce=0n;const checks=[];
  const balance=(currency,address)=>client.readContract({address:currency,abi:erc20Abi,functionName:'balanceOf',args:[address]});
  const balances=currency=>Promise.all([balance(currency,seller.account.address),balance(currency,buyer.account.address),balance(currency,original.feeRecipient)]);
  const currencies=[{symbol:'WISE',address:FUNDING_WISE,decimals:18,amount:'20'},{symbol:'WETH',address:FUNDING_WETH,decimals:18,amount:'0.01'},{...usdc,amount:'20'}];
  let last;
  for(const token of currencies) for(const id of [20n,53n]) {
    const d=deployment;
    const stakeBefore=await readZone('snapshot',[id]);
    const make=async(kind,amount,maker)=>{
      let stored;
      const signed=await publishSale(session(maker),{kind,tokenId:id,amount,days:7,nonce:++nonce,currency:token.address},async value=>{stored=value;});
      assert.deepEqual(signed,stored);
      const parsed=parseSignedSale(signed,d);
      assert.equal((await verifySignedSale(client,d,signed,await client.getBlock())).status,'available');
      assert.equal(await client.readContract({address:d.market,abi:seaportAbi,functionName:'getOrderHash',args:[seaportComponents(d,parsed.order)]}),parsed.hash);
      return {o:parsed.order,signature:signed.signature,signed};
    };
    const run=(wallet,signed)=>fillSale(session(wallet),signed.signed);
    const amount=parseUnits(token.amount,token.decimals);
    await receipt(await seller.writeContract({address:d.collection,abi:nftAbi,functionName:'approve',args:[d.market,id]}));
    await receipt(await buyer.writeContract({address:token.address,abi:erc20Abi,functionName:'approve',args:[d.market,amount]}));
    const ask=await make(0,amount,seller,seller.account.address),before=await balances(token.address);
    await run(buyer,ask);
    const after=await balances(token.address),parts=saleAmounts(ask.o);
    assert.equal(after[0]-before[0],parts.net);assert.equal(before[1]-after[1],parts.gross);assert.equal(after[2]-before[2],parts.fee);
    assert.equal((await owner(id)).toLowerCase(),buyer.account.address.toLowerCase());
    assert.deepEqual(await readZone('snapshot',[id]),stakeBefore);
    await assert.rejects(run(buyer,ask));
    await receipt(await buyer.writeContract({address:d.collection,abi:nftAbi,functionName:'approve',args:[d.market,id]}));
    const bidAmount=amount*9n/10n;
    await receipt(await seller.writeContract({address:token.address,abi:erc20Abi,functionName:'approve',args:[d.market,bidAmount]}));
    const bid=await make(1,bidAmount,seller,buyer.account.address),beforeBid=await balances(token.address);
    await run(buyer,bid);
    const afterBid=await balances(token.address),bidParts=saleAmounts(bid.o);
    assert.equal(beforeBid[0]-afterBid[0],bidParts.gross);assert.equal(afterBid[1]-beforeBid[1],bidParts.net);assert.equal(afterBid[2]-beforeBid[2],bidParts.fee);
    assert.equal((await owner(id)).toLowerCase(),seller.account.address.toLowerCase());
    assert.deepEqual(await readZone('snapshot',[id]),stakeBefore);
    await assert.rejects(run(buyer,bid));
    last={d,make,run};
    checks.push(`${token.symbol} #${id}: listing, bid acceptance, exact balances/fees, preserved stake, replay rejection`);
  }
  const atomicChecks=[];
  for(const output of currencies) for(const input of purchaseFundingTokens.filter(t=>t.address!==output.address)) {
    const id=20n, amount=parseUnits(output.amount,output.decimals);
    const beforeSnapshot=await readZone('snapshot',[id]);
    const signed=await publishSale(session(seller),{kind:0,tokenId:id,amount,days:7,nonce:++nonce,currency:output.address},async()=>{});
    const parsed=parseSignedSale(signed,deployment);
    const q=await quotePurchasePayment(client,deployment,{buyer:buyer.account.address,orderHash:parsed.hash,currency:output.address,amount,inputToken:input.address,slippage:50});
    const before=await balances(output.address);
    const inputBefore=input.symbol==='ETH'?await client.getBalance({address:buyer.account.address}):await balance(input.address,buyer.account.address);
    const {receipt:paid}=await buyWithPayment(session(buyer),signed,q);
    const after=await balances(output.address);
    assert.equal(after[0]-before[0],saleAmounts(parsed.order).net);
    assert.equal(after[2]-before[2],saleAmounts(parsed.order).fee);
    assert.equal(after[1],before[1],'Buyer keeps pre-existing settlement tokens');
    const inputAfter=input.symbol==='ETH'?await client.getBalance({address:buyer.account.address}):await balance(input.address,buyer.account.address);
    assert.ok(inputBefore>inputAfter);
    if(input.symbol!=='ETH') assert.ok(inputBefore-inputAfter<=q.maxInput);
    assert.equal((await owner(id)).toLowerCase(),buyer.account.address.toLowerCase());
    assert.deepEqual(await readZone('snapshot',[id]),beforeSnapshot);
    for(const t of currencies) {
      assert.equal(await balance(t.address,router),0n);
      for(const spender of [deployment.market,FUNDING_ROUTER]) assert.equal(await client.readContract({address:t.address,abi:parseAbi(['function allowance(address,address) view returns(uint256)']),functionName:'allowance',args:[router,spender]}),0n);
    }
    assert.equal(await client.getBalance({address:router}),0n);
    await assert.rejects(buyWithPayment(session(buyer),signed,q));
    await receipt(await buyer.writeContract({address:original.collection,abi:nftAbi,functionName:'safeTransferFrom',args:[buyer.account.address,seller.account.address,id]}));
    atomicChecks.push(`${input.symbol} -> ${output.symbol}: paid, refunded, NFT delivered, no residual balance/approval; gas ${paid.gasUsed}`);
  }
  const cancelled=await last.make(0,1_000_000n,seller,seller.account.address);
  await cancelSale(session(seller),cancelled.signed);
  await assert.rejects(last.run(buyer,cancelled));
  const cancelledParsed=parseSignedSale(cancelled.signed,deployment);
  const cancelledQuote=await quotePurchasePayment(client,deployment,{buyer:buyer.account.address,orderHash:cancelledParsed.hash,currency:cancelledParsed.order.currency,amount:cancelledParsed.order.amount,inputToken:FUNDING_WETH,slippage:50});
  await receipt(await buyer.writeContract({address:FUNDING_WETH,abi:erc20Abi,functionName:'approve',args:[router,cancelledQuote.maxInput]}));
  const beforeFailed=await balance(FUNDING_WETH,buyer.account.address),ownerBefore=await owner(cancelledParsed.order.tokenId);
  const failed=await client.waitForTransactionReceipt({hash:await buyer.writeContract({address:router,abi:routerArtifact.abi,functionName:'buy',args:[advancedSale(deployment,cancelledParsed.order,cancelled.signature),FUNDING_WETH,cancelledQuote.maxInput,BigInt(Math.floor(cancelledQuote.expires/1000))],gas:1_000_000n})});
  assert.equal(failed.status,'reverted');assert.equal(await balance(FUNDING_WETH,buyer.account.address),beforeFailed);assert.equal(await owner(cancelledParsed.order.tokenId),ownerBefore);assert.equal(await balance(FUNDING_WETH,router),0n);
  atomicChecks.push('Cancelled listing: actual router transaction reverted; input tokens and NFT ownership unchanged');
  const legacy=await last.make(0,1_000_000n,seller,seller.account.address);
  // V1 encoding directed to the V2 zone is rejected on chain, even with a valid maker signature.
  const legacyDeployment={...last.d,paymentSchemaVersion:1,currency:legacy.o.currency};
  const legacySignature=await seller.signTypedData(seaportTypedData(legacyDeployment,legacy.o));
  await assert.rejects(client.simulateContract({...saleSettlement(legacyDeployment,legacy.o,legacySignature,buyer.account.address),account:buyer.account.address}));
  console.log(JSON.stringify({forkBlock:info.forkConfig.forkBlockNumber,deploymentGas:deployed.gasUsed.toString(),checks,atomicChecks,routerDeploymentGas:routerReceipt.gasUsed.toString(),additional:['cancelled order rejected','V1 proof rejected'],scope:'Isolated local fork. No live orders, assets or deployment changed.'},null,2));
} finally {assert.equal(await client.request({method:'evm_revert',params:[outer]}),true);}
