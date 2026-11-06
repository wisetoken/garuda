import { encodeFunctionData, getAddress, keccak256, type Address, type Hex } from "viem";
export type DeployKind = "zone" | "router";
export type DeploymentReview = {
  kind: DeployKind; chainId: 1; from: Address; data: Hex; creationHash: Hex; sourceHash: string;
  guardian: Address; treasury: Address; feeBps: number; zone?: Address; compiler: string; contract: string;
  checkedAt: number; gas: string; estimatedEth: string; maximumGasEth: string; balanceEth: string; affordable: boolean;
};
export type DeploymentStatus = {state:"pending"|"confirming"|"verified"|"reverted"; hash:Hex; address?:Address; confirmations:number; required:number; manifest?:string};
export type SourceStatus = {state:"pending"|"verified"|"failed"; verificationId?:string; message?:string; url?:string};
export function assertDeploymentReview(review: DeploymentReview, address: string, chainId: number, kind: DeployKind, now=Date.now()) {
  if (chainId!==1 || review.chainId!==1 || getAddress(review.from)!==getAddress(address) || review.kind!==kind ||
      review.creationHash!==keccak256(review.data) || review.data.length<100 || !/^\d+$/.test(review.gas) || BigInt(review.gas)<=0n ||
      now-review.checkedAt>120_000 || review.checkedAt>now+5000 || !review.affordable)
    throw new Error("Deployment review changed, expired, or lacks gas funds. Refresh it before signing.");
}

export type ActivationAction = "retire-v1" | "activate-v2";
export type ActivationStatus = {
  guardian: Address; legacy: Address; validator: Address; router: Address;
  legacyPaused: boolean; legacyPauseConfirmed: boolean; validatorPaused: boolean;
  sourcesVerified: boolean; apiReady: boolean; checkedAt: number;
  transaction?: {hash: Hex; state: "pending" | "confirming" | "confirmed" | "reverted"; confirmations: number};
};
export type ActivationReview = {
  action: ActivationAction; chainId: 1; from: Address; to: Address; data: Hex;
  gas: string; checkedAt: number; maximumGasEth: string; affordable: boolean;
};
export function activationAllowed(status: ActivationStatus, action: ActivationAction) {
  if (!status.sourcesVerified || !status.apiReady) return false;
  return action === "retire-v1" ? !status.legacyPaused && status.validatorPaused
    : status.legacyPaused && status.legacyPauseConfirmed && status.validatorPaused;
}

export function assertActivationReview(review:ActivationReview,status:ActivationStatus,address:string,chainId:number,action:ActivationAction,now=Date.now()) {
  const to=action==="retire-v1"?status.legacy:status.validator;
  const data=encodeFunctionData({abi:[{type:"function",name:"setNewActivityPaused",inputs:[{type:"bool"}],outputs:[],stateMutability:"nonpayable"}],functionName:"setNewActivityPaused",args:[action==="retire-v1"]});
  if (!activationAllowed(status,action)||review.action!==action||chainId!==1||review.chainId!==1||
      getAddress(address)!==getAddress(status.guardian)||getAddress(review.from)!==getAddress(address)||
      getAddress(review.to)!==getAddress(to)||review.data!==data||!/^\d+$/.test(review.gas)||BigInt(review.gas)<=0n||
      !review.affordable||now-review.checkedAt>120000||review.checkedAt>now+5000)
    throw new Error("Activation review changed. Refresh before signing with the guardian wallet.");
}

export async function deploymentApi<T>(action:string,kind:DeployKind,params:Record<string,string|undefined>={}):Promise<T>{
  const search=new URLSearchParams({kind});for(const [key,value] of Object.entries(params))if(value)search.set(key,value);
  const response=await fetch(`/__garuda_deploy/${action}?${search}`,{method:"POST",headers:{"X-Garuda-Deploy":"review"},signal:AbortSignal.timeout(90000)});
  const value=await response.json();if(!response.ok)throw new Error(value.error??"Deployment service is unavailable.");return value;
}
