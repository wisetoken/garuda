import {useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useActiveAccount,useActiveWallet,useActiveWalletChain} from "thirdweb/react";
import {ethereum} from "thirdweb/chains";
import {CheckCircle2,ExternalLink,LoaderCircle,RefreshCw} from "lucide-react";
import type {Hex} from "viem";
import {useWalletAccess} from "../lib/wallet";
import {activationAllowed,assertActivationReview,deploymentApi,type ActivationAction,type ActivationReview,type ActivationStatus} from "../lib/deployment-review";
const key="garuda:deployment:v2:activation";
type Saved={hash?:Hex;awaitingWallet?:boolean};
function readSaved():Saved{try{return JSON.parse(localStorage.getItem(key)??"{}");}catch{return {};}}
export function ActivationCard({zoneHash,routerHash}:{zoneHash?:Hex;routerHash?:Hex}){
  const account=useActiveAccount(),wallet=useActiveWallet(),chain=useActiveWalletChain(),{connect,connecting}=useWalletAccess();
  const [saved,setSaved]=useState(readSaved),[busy,setBusy]=useState(""),[error,setError]=useState(""),[hashInput,setHashInput]=useState("");
  const lock=useRef(false),context=useRef({account,wallet});context.current={account,wallet};
  const ready=!!zoneHash&&!!routerHash,params={hash:routerHash,zoneHash,txHash:saved.hash};
  const status=useQuery({queryKey:["deployment-activation",routerHash,zoneHash,saved.hash],enabled:ready,
    queryFn:()=>deploymentApi<ActivationStatus>("activation-status","router",params),retry:false,refetchOnWindowFocus:false,
    refetchInterval:q=>q.state.error?false:saved.hash&&(!q.state.data?.transaction||["pending","confirming"].includes(q.state.data.transaction.state))?15000:false});
  const state=status.data,pending=saved.awaitingWallet||!!saved.hash&&(!state?.transaction||["pending","confirming"].includes(state.transaction.state));
  const action:ActivationAction=state?.legacyPaused?"activate-v2":"retire-v1";
  const complete=!!state?.legacyPaused&&state.legacyPauseConfirmed&&!state.validatorPaused&&state.apiReady&&state.sourcesVerified;
  const guardian=!!account&&account.address.toLowerCase()===state?.guardian.toLowerCase();
  function save(value:Saved){localStorage.setItem(key,JSON.stringify(value));setSaved(value);}
  async function submit(){
    if(lock.current||!account||!wallet||!state||!activationAllowed(state,action)||pending)return;
    lock.current=true;setBusy("Checking activation…");setError("");const signer=account,expected=wallet;
    try{
      const review=await deploymentApi<ActivationReview>("activation-prepare","router",{...params,action,from:signer.address});
      if(context.current.wallet!==expected||context.current.account?.address!==signer.address||expected.getAccount()?.address!==signer.address)throw new Error("Wallet changed. Review again.");
      assertActivationReview(review,state,signer.address,expected.getChain()?.id??0,action);
      save({awaitingWallet:true});setBusy("Confirm in your wallet…");
      const result=await signer.sendTransaction({chainId:1,to:review.to,data:review.data,value:0n,gas:BigInt(review.gas)});
      save({hash:result.transactionHash});
    }catch(e){setError(e instanceof Error?e.message:"Wallet action was not completed.");}
    finally{setBusy("");lock.current=false;}
  }
  return <section className="deployment-card deployment-activation" aria-label="Activate V2 market">
    <div className="deployment-card-title"><span>03</span><h2>Activate the new market</h2>{complete&&<CheckCircle2 aria-label="Market active"/>}</div>
    <p>Pause V1 trading, then open V2 with the guardian wallet. Existing V1 offers need new signatures. Their cancellation remains available in the backup tool.</p>
    {!ready?<p>Verify both deployed contracts to continue.</p>:<>
      {state&&<dl className="deployment-details">
        <div><dt>Contract sources</dt><dd>{state.sourcesVerified?"Both verified":"Verification required"}</dd></div>
        <div><dt>Local market API</dt><dd>{state.apiReady?"V2 + payment router configured":"Configuration required"}</dd></div>
        <div><dt>Previous market (V1)</dt><dd>{state.legacyPauseConfirmed?"Paused · confirmed":state.legacyPaused?"Pause awaiting confirmations":"Active"}</dd></div>
        <div><dt>New market (V2)</dt><dd>{state.validatorPaused?"Paused":pending?"Activation confirming…":"Active"}</dd></div>
      </dl>}
      {(error||status.isError)&&<p className="deployment-error" role="alert">{error||status.error?.message}</p>}
      {saved.hash&&<div className="deployment-result"><a href={`https://etherscan.io/tx/${saved.hash}`} target="_blank" rel="noreferrer">Activation step transaction <ExternalLink size={14}/></a><p role="status">{state?.transaction?.state==="reverted"?"Transaction reverted. Check the current state before retrying.":state?.transaction?.state==="confirmed"?"Transaction confirmed":`${state?.transaction?.confirmations??0} / 12 confirmations`}</p></div>}
      {complete&&!pending?<a className="stake-primary" href="/garuda/?screen=trade&collection=signature&view=market">Open V2 market</a>:!account?<button className="stake-primary" disabled={connecting} onClick={()=>void connect()}>Connect guardian wallet</button>:chain?.id!==1?<button className="stake-primary" onClick={()=>void wallet?.switchChain(ethereum)}>Switch to Ethereum</button>:<button className="stake-primary" disabled={!state||!guardian||pending||!!busy||!activationAllowed(state,action)} onClick={()=>void submit()}>{(busy||pending||status.isLoading)&&<LoaderCircle className="sale-loading" size={16}/>} {busy||(pending?"Waiting for confirmation…":!guardian?"Connect the guardian wallet":action==="retire-v1"?"Pause V1 trading":"Activate V2 market")}</button>}
      <button className="deployment-refresh" disabled={status.isFetching||!!busy} onClick={()=>void status.refetch()}><RefreshCw size={13}/> {status.isFetching?"Checking contracts…":"Refresh activation status"}</button>
      <details className="deployment-resume"><summary>Resume with a transaction hash</summary><label>Guardian transaction hash<input value={hashInput} onChange={e=>setHashInput(e.target.value)} placeholder="0x…" spellCheck={false}/></label><button className="market-secondary" disabled={!!busy||!/^0x[0-9a-f]{64}$/i.test(hashInput.trim())} onClick={()=>{save({hash:hashInput.trim() as Hex});setError("");}}>Check transaction</button></details>
      {saved.awaitingWallet&&!busy&&<button className="market-secondary" onClick={()=>{save({});setError("");void status.refetch();}}>Wallet request dismissed · check again</button>}
    </>}
  </section>;
}
