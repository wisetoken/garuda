// Read-only preparation. This script has no signing client and never broadcasts a transaction.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, encodeDeployData, formatEther, getAddress, http, keccak256, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
const client=createPublicClient({chain:mainnet,transport:http('https://ethereum-rpc.publicnode.com',{timeout:60000})});
assert.equal(await client.getChainId(),1);
const legacy=JSON.parse(await readFile(new URL('./fixtures/signature-market.json',import.meta.url)));
const artifact=JSON.parse(await readFile(new URL('../contracts/seaport/out/GarudaSignatureSeaportZoneV2.sol/GarudaSignatureSeaportZoneV2.json',import.meta.url)));
const standardInput=await readFile(new URL('../contracts/seaport/deployments/v2-standard-input.json',import.meta.url));
JSON.parse(standardInput.toString());
const block=await client.getBlockNumber();
assert.equal(keccak256(await client.getCode({address:legacy.adapter,blockNumber:block})),legacy.adapterCodeHash);
const read=(functionName,output)=>client.readContract({address:legacy.adapter,abi:parseAbi([`function ${functionName}() view returns(${output})`]),functionName,blockNumber:block});
const [guardian,feeBps,feeRecipient]=await Promise.all([read('owner','address'),read('FEE_BPS','uint256'),read('FEE_RECIPIENT','address')]);
assert.equal(guardian.toLowerCase(),legacy.guardian.toLowerCase());
assert.equal(feeBps,50n);assert.equal(feeRecipient.toLowerCase(),legacy.feeRecipient.toLowerCase());
for(const [address,expected] of [[legacy.collection,legacy.collectionCodeHash],[legacy.currency,legacy.currencyCodeHash],[legacy.market,legacy.marketCodeHash]]) assert.equal(keccak256(await client.getCode({address,blockNumber:block})),expected);
const deployer=getAddress(process.env.GARUDA_DEPLOYER ?? guardian);
const args=[legacy.collection,legacy.currency,legacy.collectionCodeHash,legacy.currencyCodeHash,legacy.marketCodeHash,guardian,feeBps,feeRecipient];
const data=encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode.object,args});
const [estimatedGas,fees]=await Promise.all([client.estimateGas({account:deployer,data,value:0n}),client.estimateFeesPerGas()]);
const gasLimit=(estimatedGas*120n+99n)/100n;
const review={status:'unsigned; not deployed',chainId:1,checkedAtBlock:block.toString(),checkedAt:new Date().toISOString(),contract:'GarudaSignatureSeaportZoneV2',legacyValidator:legacy.adapter,
  guardian,feeBps:Number(feeBps),feeRecipient,initiallyPaused:true,
  constructorArguments:args.map(v=>typeof v==='bigint'?v.toString():v),
  standardInputSha256:createHash('sha256').update(standardInput).digest('hex'),creationDataKeccak:keccak256(data),
  gas:{estimate:estimatedGas.toString(),suggestedLimit:gasLimit.toString(),observedMaxFeePerGas:fees.maxFeePerGas.toString(),estimatedCostEth:formatEther(estimatedGas*fees.maxFeePerGas),suggestedLimitCostEth:formatEther(gasLimit*fees.maxFeePerGas),note:'Gas prices are observations. Refresh before wallet confirmation.'},
  transaction:{chainId:1,from:deployer,value:'0',data},
  activation:'A separate guardian transaction is required after app migration and deployed-source verification. This file does not pause or migrate V1.'};
await writeFile(new URL('../contracts/seaport/deployments/v2-deployment-review.json',import.meta.url),JSON.stringify(review,null,2)+'\n');
console.log(JSON.stringify({...review,transaction:{...review.transaction,data:`${data.slice(0,18)}… (${(data.length-2)/2} bytes)`}},null,2));
