import {ETHEREUM_CONFIRMATIONS} from "../src/lib/confirmation-policy";
// Local Vite operator tooling. No private keys, signing clients, or activation calls.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createPublicClient,encodeDeployData,encodeFunctionData,formatEther,getAddress,http,keccak256,type Address,type Hex,type PublicClient} from "viem";
import {mainnet} from "viem/chains";
import type {Plugin} from "vite";
import {parseSalesDeployment} from "../src/lib/blend/sales";
import {verifySalesDeployment} from "../src/lib/blend/sales-chain";
import {verifyPurchaseRouter} from "../src/lib/market/purchase-payment";
import {activationAllowed,type ActivationAction,type ActivationReview,type ActivationStatus,type DeployKind,type DeploymentReview,type DeploymentStatus,type SourceStatus} from "../src/lib/deployment-review";
const names={zone:"GarudaSignatureSeaportZoneV2",router:"GarudaPurchaseRouter"} as const;
const client=createPublicClient({chain:mainnet,transport:http("https://ethereum-rpc.publicnode.com",{timeout:30000,retryCount:1})});
const base=resolve(process.cwd(),"contracts/seaport");
const json=async(path:string)=>JSON.parse(await readFile(path,"utf8"));
const legacy=()=>json(resolve(process.cwd(),"scripts/fixtures/signature-market.json"));
export async function deploymentPackage(kind:DeployKind,zone?:Address) {
  const original=await legacy();
  const artifact=await json(resolve(base,`out/${names[kind]}.sol/${names[kind]}.json`));
  const source=await readFile(resolve(base,`deployments/${kind==="zone"?"v2":"router"}-standard-input.json`),"utf8"),input=JSON.parse(source);
  for(const [path,value] of Object.entries(input.sources) as [string,{content:string}][]) {
    const local=resolve(base,path);assert.ok(local.startsWith(base+"/"));assert.equal(await readFile(local,"utf8"),value.content,`Rebuild changed source: ${path}`);
  }
  assert.equal(artifact.metadata.compiler.version,"0.8.30+commit.73712a01");
  const args=kind==="zone"?[original.collection,original.currency,original.collectionCodeHash,original.currencyCodeHash,original.marketCodeHash,original.guardian,BigInt(original.feeBps),original.feeRecipient]:[zone];
  if(kind==="router")assert.ok(zone,"Verify the zone deployment first.");
  const data=encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode.object,args});
  if(kind==="zone") {
    const reviewed=await json(resolve(base,"deployments/v2-deployment-review.json"));
    assert.equal(keccak256(data),reviewed.creationDataKeccak,"Zone build differs from reviewed creation code.");
    assert.equal(createHash("sha256").update(source).digest("hex"),reviewed.standardInputSha256,"Zone verification input changed.");
  }
  return {artifact,input,source,args,data,original};
}
export function assertRuntime(actual:Hex,artifact:{deployedBytecode:{object:string;immutableReferences:Record<string,{start:number;length:number}[]>}}) {
  const live=Buffer.from(actual.slice(2),"hex"),compiled=Buffer.from(artifact.deployedBytecode.object.replace(/^0x/,""),"hex");
  assert.equal(live.length,compiled.length,"Unexpected deployed bytecode length.");
  for(const locations of Object.values(artifact.deployedBytecode.immutableReferences))for(const {start,length} of locations){live.fill(0,start,start+length);compiled.fill(0,start,start+length);}
  assert.deepEqual(live,compiled,"Deployed code does not match local compiled source.");
}
export async function verifyLocalDeployment(kind:DeployKind,hash:Hex,zoneHash?:Hex,rpc:PublicClient=client):Promise<DeploymentStatus> {
  assert.match(hash,/^0x[0-9a-f]{64}$/i);assert.equal(await rpc.getChainId(),1);
  let zone:Address|undefined;
  if(kind==="router") {const status=await verifyLocalDeployment("zone",zoneHash!,undefined,rpc);assert.equal(status.state,"verified","Wait for the zone deployment to be verified.");zone=status.address;}
  const pack=await deploymentPackage(kind,zone);
  let receipt;
  try {receipt=await rpc.getTransactionReceipt({hash});} catch(error){if(error instanceof Error && /not.*found|could not be found/i.test(error.message))return {state:"pending",hash,confirmations:0,required:ETHEREUM_CONFIRMATIONS};throw error;}
  if(receipt.status!=="success")return {state:"reverted",hash,confirmations:0,required:ETHEREUM_CONFIRMATIONS};
  assert.ok(receipt.contractAddress);
  const tx=await rpc.getTransaction({hash});assert.equal(tx.to,null);assert.equal(tx.value,0n);assert.equal(tx.input.toLowerCase(),pack.data.toLowerCase(),"Transaction is not the reviewed deployment.");
  const address=getAddress(receipt.contractAddress),code=await rpc.getCode({address});assert.ok(code&&code!=="0x");assertRuntime(code,pack.artifact);
  const confirmations=Number((await rpc.getBlockNumber({cacheTime:0}))-receipt.blockNumber+1n);
  if(confirmations<ETHEREUM_CONFIRMATIONS)return {state:"confirming",hash,address,confirmations,required:ETHEREUM_CONFIRMATIONS};
  let deployment;
  if(kind==="zone") {
    deployment=parseSalesDeployment({...pack.original,paymentSchemaVersion:2,adapter:address,adapterCodeHash:keccak256(code),deploymentBlock:String(receipt.blockNumber),deploymentBlockHash:receipt.blockHash});
    await verifySalesDeployment(rpc,deployment);
    // Identity verification remains valid after the guardian activates V2.
  } else {
    deployment=parseSalesDeployment({...await json(resolve(base,"deployments/ethereum-mainnet-v2.json")),purchaseRouter:{address,codeHash:keccak256(code)}});
    assert.equal(deployment.adapter.toLowerCase(),zone!.toLowerCase());await verifyPurchaseRouter(rpc,deployment);
  }
  const manifest=kind==="zone"?"ethereum-mainnet-v2.json":"ethereum-mainnet-v2-with-router.json";
  await writeFile(resolve(base,`deployments/${manifest}`),JSON.stringify(deployment,null,2)+"\n");
  return {state:"verified",hash,address,confirmations,required:ETHEREUM_CONFIRMATIONS,manifest:`contracts/seaport/deployments/${manifest}`};
}
export async function prepareLocalDeployment(kind:DeployKind,from:Address,zoneHash?:Hex):Promise<DeploymentReview> {
  assert.equal(await client.getChainId(),1);from=getAddress(from);
  let zone:Address|undefined;
  if(kind==="router"){const status=await verifyLocalDeployment("zone",zoneHash!);assert.equal(status.state,"verified","Verify the zone first.");zone=status.address;}
  const {artifact,source,data,original}=await deploymentPackage(kind,zone);
  for(const [address,expected] of [[original.adapter,original.adapterCodeHash],[original.collection,original.collectionCodeHash],[original.currency,original.currencyCodeHash],[original.market,original.marketCodeHash]])assert.equal(keccak256((await client.getCode({address}))!),expected,"Pinned contract code changed.");
  const [estimate,fees,balance]=await Promise.all([client.estimateGas({account:from,data,value:0n}),client.estimateFeesPerGas(),client.getBalance({address:from})]);
  const gas=(estimate*120n+99n)/100n,maximum=gas*fees.maxFeePerGas;
  return {kind,chainId:1,from,data,creationHash:keccak256(data),sourceHash:createHash("sha256").update(source).digest("hex"),guardian:original.guardian,treasury:original.feeRecipient,feeBps:original.feeBps,zone,compiler:artifact.metadata.compiler.version,contract:names[kind],checkedAt:Date.now(),gas:String(gas),estimatedEth:formatEther(estimate*fees.maxFeePerGas),maximumGasEth:formatEther(maximum),balanceEth:formatEther(balance),affordable:balance>=maximum};
}
const sourcify="https://sourcify.dev/server";
const jobs=new Map<string,string>();
export function sourceOutcome(value:{runtimeMatch?:string|null;creationMatch?:string|null}):boolean {
  return ["exact_match","match"].includes(value.runtimeMatch??"") && ["exact_match","match"].includes(value.creationMatch??"");
}
async function sourceFetch(path:string,body?:unknown){
  const response=await fetch(`${sourcify}${path}`,{method:body?"POST":"GET",headers:{"Content-Type":"application/json","User-Agent":"WiseOne-Garuda/0.1 (https://github.com/wisetoken/garuda)"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  const result=await response.json();if(!response.ok && response.status!==404 && response.status!==409)throw new Error(`Source verification service returned ${response.status}. Try again later.`);return {status:response.status,result};
}
async function verifySource(kind:DeployKind,hash:Hex,zoneHash?:Hex):Promise<SourceStatus>{
  const status=await verifyLocalDeployment(kind,hash,zoneHash);assert.equal(status.state,"verified","Confirm and check the deployment first.");
  const address=status.address!,lookup=await sourceFetch(`/v2/contract/1/${address}`);
  const url=`https://repo.sourcify.dev/1/${address}`;
  if(sourceOutcome(lookup.result))return {state:"verified",url};
  const job=jobs.get(hash);
  if(job){const result=await sourceFetch(`/v2/verify/${encodeURIComponent(job)}`);if(!result.result.isJobCompleted)return {state:"pending",verificationId:job,url};jobs.delete(hash);if(result.result.error)return {state:"failed",message:"Source verification failed. Inspect Sourcify or retry with the compiler input.",url};return {state:"pending",url};}
  const zone=kind==="router"?(await verifyLocalDeployment("zone",zoneHash!)).address:undefined;
  const {input,artifact}=await deploymentPackage(kind,zone);
  const submitted=await sourceFetch(`/v2/verify/1/${address}`,{stdJsonInput:input,compilerVersion:artifact.metadata.compiler.version,contractIdentifier:`src/${names[kind]}.sol:${names[kind]}`,creationTransactionHash:hash});
  if(typeof submitted.result.verificationId==="string"){jobs.set(hash,submitted.result.verificationId);return {state:"pending",verificationId:submitted.result.verificationId,url};}
  return {state:"failed",message:"Source verification was not accepted yet. Retry after the explorer indexes the deployment.",url};
}
const pauseAbi=[{type:"function",name:"setNewActivityPaused",inputs:[{name:"paused",type:"bool"}],outputs:[],stateMutability:"nonpayable"},{type:"function",name:"newActivityPaused",inputs:[],outputs:[{type:"bool"}],stateMutability:"view"}] as const;
export async function activationStatus(hash:Hex,zoneHash:Hex,apiOrigin:string,txHash?:Hex):Promise<ActivationStatus> {
  const verified=await verifyLocalDeployment("router",hash,zoneHash);
  assert.equal(verified.state,"verified","Verify both deployments first.");
  const d=await json(resolve(base,"deployments/ethereum-mainnet-v2-with-router.json")),old=await legacy();
  const head=await client.getBlockNumber({cacheTime:0});
  const [legacyCode,legacyPaused,legacyPauseConfirmed,validatorPaused,zoneSource,routerSource]=await Promise.all([
    client.getCode({address:old.adapter}),
    client.readContract({address:old.adapter,abi:pauseAbi,functionName:"newActivityPaused"}),
    client.readContract({address:old.adapter,abi:pauseAbi,functionName:"newActivityPaused",blockNumber:head-BigInt(ETHEREUM_CONFIRMATIONS-1)}),
    client.readContract({address:d.adapter,abi:pauseAbi,functionName:"newActivityPaused"}),
    sourceFetch(`/v2/contract/1/${d.adapter}`),sourceFetch(`/v2/contract/1/${d.purchaseRouter.address}`),
  ]);
  assert.equal(keccak256(legacyCode!),old.adapterCodeHash,"Previous validator code changed.");
  let apiReady=false;
  try {const response=await fetch(`${apiOrigin}/api/garuda/catalog-config`,{signal:AbortSignal.timeout(10000)});const result=await response.json();apiReady=response.ok&&result.enabled&&JSON.stringify(parseSalesDeployment(result.deployment))===JSON.stringify(parseSalesDeployment(d));}catch{/* Keep activation unavailable if the API cannot be checked. */}
  let transaction:ActivationStatus["transaction"];
  if(txHash){
    assert.match(txHash,/^0x[0-9a-f]{64}$/i);
    try {
      const tx=await client.getTransaction({hash:txHash});
      assert.equal(tx.from.toLowerCase(),d.guardian.toLowerCase());assert.equal(tx.value,0n);
      const retirement=tx.to?.toLowerCase()===old.adapter.toLowerCase();
      assert.equal(tx.to?.toLowerCase(),(retirement?old.adapter:d.adapter).toLowerCase());
      assert.equal(tx.input,encodeFunctionData({abi:pauseAbi,functionName:"setNewActivityPaused",args:[retirement]}));
      const receipt=await client.getTransactionReceipt({hash:txHash}),confirmations=Math.max(0,Number(head-receipt.blockNumber+1n));
      transaction={hash:txHash,state:receipt.status!=="success"?"reverted":confirmations>=ETHEREUM_CONFIRMATIONS?"confirmed":"confirming",confirmations};
    }catch(error){if(error instanceof Error&&/not.*found|could not be found/i.test(error.message))transaction={hash:txHash,state:"pending",confirmations:0};else throw error;}
  }
  return {guardian:d.guardian,legacy:old.adapter,validator:d.adapter,router:d.purchaseRouter.address,legacyPaused,legacyPauseConfirmed,validatorPaused,sourcesVerified:sourceOutcome(zoneSource.result)&&sourceOutcome(routerSource.result),apiReady,checkedAt:Date.now(),transaction};
}
export async function prepareActivation(action:ActivationAction,from:Address,hash:Hex,zoneHash:Hex,apiOrigin:string):Promise<ActivationReview>{
  assert.ok(action==="retire-v1"||action==="activate-v2");
  const state=await activationStatus(hash,zoneHash,apiOrigin);
  assert.equal(getAddress(from),getAddress(state.guardian),"Connect the guardian wallet.");
  assert.ok(activationAllowed(state,action),"Wait for source verification, API configuration and the preceding step's confirmations.");
  const to=action==="retire-v1"?state.legacy:state.validator;
  const data=encodeFunctionData({abi:pauseAbi,functionName:"setNewActivityPaused",args:[action==="retire-v1"]});
  const [estimate,fees,balance]=await Promise.all([client.estimateGas({account:from,to,data,value:0n}),client.estimateFeesPerGas(),client.getBalance({address:from})]);
  const gas=(estimate*120n+99n)/100n,maximum=gas*fees.maxFeePerGas;
  return {action,chainId:1,from,to,data,gas:String(gas),checkedAt:Date.now(),maximumGasEth:formatEther(maximum),affordable:balance>=maximum};
}
export function allowLocalDeployment(host:string|undefined,remote:string|undefined,origin:string|undefined){
  if(!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host) || !["127.0.0.1","::1","::ffff:127.0.0.1"].includes(remote??""))return false;
  return !origin || origin===`http://${host}`;
}
export function localDeploymentPlugin(apiOrigin="http://127.0.0.1:3213"):Plugin {
  return {name:"garuda-local-deployment",apply:"serve",configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(!req.url?.startsWith("/__garuda_deploy/"))return next();
    res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json");
    if(!allowLocalDeployment(req.headers.host,req.socket.remoteAddress,req.headers.origin)){res.statusCode=403;return res.end(JSON.stringify({error:"Local operator access only."}));}
    try {
      const url=new URL(req.url,`http://${req.headers.host}`),kind=url.searchParams.get("kind");assert.ok(kind==="zone"||kind==="router");
      const hash=url.searchParams.get("hash") as Hex,zoneHash=url.searchParams.get("zoneHash") as Hex;
      let result;
      if(url.pathname.endsWith("/source-input") && req.method==="GET"){
        const filename=kind==="zone"?"v2-standard-input.json":"router-standard-input.json";
        res.setHeader("Content-Disposition",`attachment; filename="${filename}"`);return res.end(await readFile(resolve(base,`deployments/${filename}`),"utf8"));
      }
      if(req.method!=="POST" || req.headers["x-garuda-deploy"]!=="review"){res.statusCode=405;return res.end(JSON.stringify({error:"Use the local deployment screen."}));}
      if(url.pathname.endsWith("/activation-status"))result=await activationStatus(hash,zoneHash,apiOrigin,url.searchParams.get("txHash") as Hex|undefined);
      else if(url.pathname.endsWith("/activation-prepare"))result=await prepareActivation(url.searchParams.get("action") as ActivationAction,getAddress(url.searchParams.get("from")??""),hash,zoneHash,apiOrigin);
      else if(url.pathname.endsWith("/prepare"))result=await prepareLocalDeployment(kind,getAddress(url.searchParams.get("from")??""),zoneHash);
      else if(url.pathname.endsWith("/status"))result=await verifyLocalDeployment(kind,hash,zoneHash);
      else if(url.pathname.endsWith("/source"))result=await verifySource(kind,hash,zoneHash);
      else {res.statusCode=404;return res.end(JSON.stringify({error:"Unknown deployment action."}));}
      res.end(JSON.stringify(result));
    } catch(error){res.statusCode=400;res.end(JSON.stringify({error:error instanceof Error?error.message:"Deployment check failed."}));}
  });}};
}
