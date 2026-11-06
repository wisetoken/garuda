import {useEffect,useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useActiveAccount,useActiveWallet,useActiveWalletChain} from "thirdweb/react";
import {ethereum} from "thirdweb/chains";
import {CheckCircle2,ExternalLink,LoaderCircle,RefreshCw,Download,Wallet} from "lucide-react";
import {type Hex} from "viem";
import {useWalletAccess} from "../lib/wallet";
import {assertDeploymentReview,type DeploymentReview,type DeploymentStatus,type SourceStatus,type DeployKind} from "../lib/deployment-review";
import {ActivationCard} from "./ActivationCard";
import {deploymentApi} from "../lib/deployment-review";
import sourceVerification from "../../contracts/seaport/deployments/source-verification.json";
import "./deployment.css";

type SavedDeployment={hash?:Hex;awaitingWallet?:boolean};
const storageKey=(kind:DeployKind)=>`garuda:deployment:v2:${kind}`;
function readSaved(kind:DeployKind):SavedDeployment {try {return JSON.parse(localStorage.getItem(storageKey(kind))??"{}");}catch{return {};}}
export function DeploymentPage(){
  const [zone,setZone]=useState<DeploymentStatus>(),[router,setRouter]=useState<DeploymentStatus>();
  return <div className="deployment-page">
    <header><span className="deployment-eyebrow">LOCAL DEPLOYMENT · ETHEREUM MAINNET</span><h1>Bring multi-token payments to Garuda.</h1><p>Deploy the stake validator, then the payment router. Your wallet signs each deployment. Source verification follows automatically.</p></header>
    <div className="deployment-grid">
      <DeploymentCard kind="zone" onVerified={setZone}/>
      <DeploymentCard kind="router" zoneHash={zone?.state==="verified"?zone.hash:undefined} onVerified={setRouter}/>
    </div>
    <ActivationCard zoneHash={zone?.state==="verified"?zone.hash:undefined} routerHash={router?.state==="verified"?router.hash:undefined}/>
  </div>;
}
function DeploymentCard({kind,zoneHash,onVerified}:{kind:DeployKind;zoneHash?:Hex;onVerified?:(value:DeploymentStatus | undefined)=>void}){
  const account=useActiveAccount(),wallet=useActiveWallet(),chain=useActiveWalletChain(),{connect,connecting}=useWalletAccess();
  const [saved,setSaved]=useState<SavedDeployment>(()=>readSaved(kind));
  const [review,setReview]=useState<DeploymentReview>();
  const [busy,setBusy]=useState(""),[error,setError]=useState(""),[hashInput,setHashInput]=useState("");
  const lock=useRef(false),context=useRef({account,wallet});context.current={account,wallet};
  const hash=saved.hash,ready=kind==="zone"||!!zoneHash;
  function save(next:SavedDeployment){localStorage.setItem(storageKey(kind),JSON.stringify(next));setSaved(next);}
  const status=useQuery({queryKey:["deployment-status",kind,hash,zoneHash],enabled:!!hash&&ready,queryFn:()=>deploymentApi<DeploymentStatus>("status",kind,{hash,zoneHash}),retry:false,
    refetchInterval:q=>q.state.error||["verified","reverted"].includes(q.state.data?.state??"")?false:12000});
  useEffect(()=>{onVerified?.(status.data?.state==="verified"?status.data:undefined);},[status.data,onVerified]);
  const source=useQuery({queryKey:["deployment-source",kind,hash,zoneHash],enabled:status.data?.state==="verified",queryFn:()=>deploymentApi<SourceStatus>("source",kind,{hash,zoneHash}),retry:false,refetchOnWindowFocus:false,
    refetchInterval:q=>q.state.error||q.state.data?.state!=="pending"?false:15000});
  const activeReview=review?.from.toLowerCase()===account?.address.toLowerCase()?review:undefined;
  async function prepare(){
    if(lock.current||!account||!ready)return;
    lock.current=true;setBusy("Checking contracts & gas…");setError("");
    try{setReview(await deploymentApi<DeploymentReview>("prepare",kind,{from:account.address,zoneHash}));}catch(e){setError(e instanceof Error?e.message:"Could not prepare deployment.");}finally{setBusy("");lock.current=false;}
  }
  async function deploy(){
    if(lock.current||!account||!wallet||!activeReview||saved.awaitingWallet||hash)return;
    lock.current=true;setBusy("Refreshing deployment…");setError("");
    const signer=account,expectedWallet=wallet;
    try{
      const fresh=await deploymentApi<DeploymentReview>("prepare",kind,{from:signer.address,zoneHash});setReview(fresh);
      if(context.current.wallet!==expectedWallet||context.current.account?.address!==signer.address||expectedWallet.getAccount()?.address!==signer.address)throw new Error("Wallet changed. Review again.");
      assertDeploymentReview(fresh,signer.address,expectedWallet.getChain()?.id??0,kind);
      if(fresh.creationHash!==activeReview.creationHash)throw new Error("Contract changed. Review the new deployment first.");
      save({awaitingWallet:true});setBusy("Confirm deployment in your wallet…");
      const result=await signer.sendTransaction({chainId:1,data:fresh.data,value:0n,gas:BigInt(fresh.gas)});
      // Save the public hash immediately. Failed confirmation checks never trigger another deployment.
      save({hash:result.transactionHash});
    }catch(e){setError(e instanceof Error?e.message:"Deployment was not completed. Check your wallet.");}
    finally{setBusy("");lock.current=false;}
  }
  const address=status.data?.address;
  const etherscanSource=sourceVerification.contracts.find(contract=>contract.address.toLowerCase()===address?.toLowerCase()&&contract.etherscan.match==="exact")?.etherscan.url;
  const number=kind==="zone"?"01":"02",title=kind==="zone"?"Stake validator":"Uniswap payment router";
  return <section className="deployment-card" aria-label={title}>
    <div className="deployment-card-title"><span>{number}</span><h2>{title}</h2>{status.data?.state==="verified"&&<CheckCircle2 aria-label="Deployment verified"/>}</div>
    <p>{kind==="zone"?"Listings and bids in WISE, WETH and USDC. Retains the existing guardian and 0.5% marketplace fee.":"Buy a stake using ETH, WETH, USDC or WISE. The swap and purchase succeed together, with unused input returned."}</p>
    {activeReview&&<dl className="deployment-details">
      <div><dt>Network</dt><dd>Ethereum mainnet</dd></div>
      <div><dt>Estimated deployment gas</dt><dd>{Number(activeReview.estimatedEth).toFixed(6)} ETH</dd></div>
      <div><dt>Gas budget with headroom</dt><dd>{Number(activeReview.maximumGasEth).toFixed(6)} ETH</dd></div>
      <div><dt>Wallet balance</dt><dd>{Number(activeReview.balanceEth).toFixed(6)} ETH</dd></div>
      <div><dt>{kind==="zone"?"Initial state":"Settlement"}</dt><dd>{kind==="zone"?"Paused":"Atomic purchase"}</dd></div>
      <details><summary>Contract settings</summary><dt>Guardian</dt><dd>{activeReview.guardian}</dd><dt>Fee recipient</dt><dd>{activeReview.treasury}</dd><dt>Creation code hash</dt><dd>{activeReview.creationHash}</dd><dt>Compiler</dt><dd>{activeReview.compiler}</dd></details>
    </dl>}
    {(error||status.isError||source.isError)&&<p className="deployment-error" role="alert">{error||status.error?.message||source.error?.message}</p>}
    {hash?<div className="deployment-result">
      <a href={`https://etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">Deployment transaction <ExternalLink size={14}/></a>
      {address&&<a href={`https://etherscan.io/address/${address}`} target="_blank" rel="noreferrer">{address} <ExternalLink size={14}/></a>}
      <p role="status">{status.data?.state==="verified"?"Deployed · bytecode and configuration verified":status.data?.state==="reverted"?"Deployment reverted. No contract was created.":status.data?.state==="confirming"?`${status.data.confirmations} / ${status.data.required} confirmation${status.data.required===1?"":"s"}`:"Waiting for deployment confirmation…"}</p>
      {status.data?.state!=="verified"&&<button type="button" className="market-secondary" disabled={status.isFetching} onClick={()=>void status.refetch()}><RefreshCw size={15}/>{status.isFetching?"Checking…":"Check transaction"}</button>}
      {status.data?.state==="verified"&&<><p role="status">{source.data?.state==="verified"?"Source verified on Sourcify":source.data?.state==="failed"?source.data.message:source.isError?"Source verification needs a retry.":"Verifying source on Sourcify…"}</p>
        {source.data?.url&&<a href={source.data.url} target="_blank" rel="noreferrer">View source verification <ExternalLink size={14}/></a>}
        {(source.isError||source.data?.state==="failed")&&<button type="button" className="market-secondary" disabled={source.isFetching} onClick={()=>void source.refetch()}>Retry source verification</button>}
        <a href={etherscanSource??`https://etherscan.io/verifyContract?a=${address}`} target="_blank" rel="noreferrer">{etherscanSource?"Source verified on Etherscan":"Verify on Etherscan"} <ExternalLink size={14}/></a>
        {!etherscanSource&&<small>Use Solidity Standard JSON Input, compiler v0.8.30+commit.73712a01, MIT license. Etherscan verification is separate from the Sourcify result above.</small>}
      </>}
    </div>:<div className="deployment-actions">
      {!ready?<button className="stake-primary" disabled>Verify the validator first</button>:!account?<button type="button" className="stake-primary" disabled={connecting} onClick={()=>void connect()}><Wallet size={16}/>{connecting?"Connecting…":"Connect wallet to deploy"}</button>:chain?.id!==1?<button type="button" className="stake-primary" onClick={()=>void wallet?.switchChain(ethereum)}>Switch to Ethereum</button>:saved.awaitingWallet?<p>Check the pending request in your wallet. Paste its transaction hash below if it was sent.</p>:!activeReview?<button type="button" className="stake-primary" disabled={!!busy} onClick={()=>void prepare()}>{busy&&<LoaderCircle className="sale-loading" size={16}/>} {busy||"Review deployment & gas"}</button>:<>
        <button type="button" className="stake-primary" disabled={!!busy||!activeReview.affordable} onClick={()=>void deploy()}>{busy&&<LoaderCircle className="sale-loading" size={16}/>} {busy||(!activeReview.affordable?"Insufficient ETH for gas":`Deploy ${kind==="zone"?"validator":"payment router"}`)}</button>
        <button type="button" className="deployment-refresh" disabled={!!busy} onClick={()=>void prepare()}>Refresh gas estimate</button>
      </>}
      {saved.awaitingWallet&&!busy&&<button type="button" className="market-secondary" onClick={()=>{save({});setError("");}}>Wallet request was rejected · review again</button>}
    </div>}
    <a className="deployment-download" href={`/__garuda_deploy/source-input?kind=${kind}`} download><Download size={15}/> Download compiler input</a>
    <details className="deployment-resume"><summary>{hash?"Check a replacement transaction":"Already deployed? Resume with its hash"}</summary><label>Deployment transaction hash<input value={hashInput} onChange={e=>setHashInput(e.target.value)} placeholder="0x…" spellCheck={false}/></label><button type="button" className="market-secondary" disabled={!!busy||!/^0x[0-9a-f]{64}$/i.test(hashInput.trim())} onClick={()=>{save({hash:hashInput.trim() as Hex});setError("");}}>Check this deployment</button></details>
  </section>;
}
