// Read-only post-deployment verification. Accepts a public transaction hash; never signs or broadcasts.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,encodeDeployData,encodeFunctionData,http,keccak256} from 'viem';
import {mainnet} from 'viem/chains';
import {parseSalesDeployment} from '../src/lib/blend/sales.ts';
import {verifySalesDeployment} from '../src/lib/blend/sales-chain.ts';
const txHash=process.argv[2];
assert.match(txHash??'',/^0x[0-9a-f]{64}$/i,'Provide the public V2 deployment transaction hash.');
const client=createPublicClient({chain:mainnet,transport:http('https://ethereum-rpc.publicnode.com',{timeout:60000})});
assert.equal(await client.getChainId(),1);
const original=JSON.parse(await readFile(new URL('./fixtures/signature-market.json',import.meta.url)));
const artifact=JSON.parse(await readFile(new URL('../contracts/seaport/out/GarudaSignatureSeaportZoneV2.sol/GarudaSignatureSeaportZoneV2.json',import.meta.url)));
const input=JSON.parse(await readFile(new URL('../contracts/seaport/deployments/v2-standard-input.json',import.meta.url)));
for(const [path,source] of Object.entries(input.sources))
 assert.equal(await readFile(new URL(`../contracts/seaport/${path}`,import.meta.url),'utf8'),source.content,`Source changed: ${path}`);
const [tx,receipt]=await Promise.all([client.getTransaction({hash:txHash}),client.getTransactionReceipt({hash:txHash})]);
assert.equal(receipt.status,'success');assert.ok(receipt.contractAddress);assert.equal(tx.to,null);
const args=[original.collection,original.currency,original.collectionCodeHash,original.currencyCodeHash,original.marketCodeHash,original.guardian,BigInt(original.feeBps),original.feeRecipient];
assert.equal(tx.input.toLowerCase(),encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode.object,args}).toLowerCase(),'Deployment must match reviewed creation code and immutable values.');
const address=receipt.contractAddress,code=await client.getCode({address});assert.ok(code&&code!=='0x');
const live=Buffer.from(code.slice(2),'hex'),compiled=Buffer.from(artifact.deployedBytecode.object.replace(/^0x/,''),'hex');
assert.equal(live.length,compiled.length);
for(const locations of Object.values(artifact.deployedBytecode.immutableReferences))for(const {start,length} of locations){live.fill(0,start,start+length);compiled.fill(0,start,start+length);}
assert.deepEqual(live,compiled,'Runtime must match compiled source outside immutable slots.');
const deployment=parseSalesDeployment({...original,paymentSchemaVersion:2,adapter:address,adapterCodeHash:keccak256(code),deploymentBlock:String(receipt.blockNumber),deploymentBlockHash:receipt.blockHash});
await verifySalesDeployment(client,deployment);
assert.equal(await client.readContract({address,abi:artifact.abi,functionName:'newActivityPaused'}),true,'Keep V2 paused until source verification and API cutover finish.');
const base=new URL('../contracts/seaport/deployments/',import.meta.url);
await writeFile(new URL('ethereum-mainnet-v2.json',base),JSON.stringify(deployment,null,2)+'\n');
const transactions=[
 {purpose:'Retire V1 trading; cancellation remains available',chainId:1,from:original.guardian,to:original.adapter,value:'0',data:encodeFunctionData({abi:artifact.abi,functionName:'setNewActivityPaused',args:[true]})},
 {purpose:'Open V2 only after configuring the verified manifest and confirming V1 is paused',chainId:1,from:original.guardian,to:address,value:'0',data:encodeFunctionData({abi:artifact.abi,functionName:'setNewActivityPaused',args:[false]})},
];
await writeFile(new URL('v2-activation-review.json',base),JSON.stringify({status:'unsigned',deploymentTransaction:txHash,transactions},null,2)+'\n');
console.log(JSON.stringify({address,transactionHash:txHash,verified:true,paused:true,manifest:'contracts/seaport/deployments/ethereum-mainnet-v2.json',next:'Verify source on Etherscan, configure the API manifest, pause V1, then activate V2 with the guardian wallet.'},null,2));
