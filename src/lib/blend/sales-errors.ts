import { SalesError } from "./sales";
import type { SalesStep } from "./sales-wallet";
const labels:Record<SalesStep,string>={checking:"Checking the stake", "approving-nft":"Approving the NFT", "approving-wise":"Approving WISE", signing:"Signing the order", publishing:"Publishing the signed order",confirming:"Confirming the transaction",settling:"Settling the sale",cancelling:"Cancelling the order"};
function safe(message:string){return message.replace(/https?:\/\/\S+/gi,"[RPC endpoint]").replace(/0x[0-9a-f]{80,}/gi,"[transaction data]").replace(/[\r\n]+/g," ").slice(0,280);}
export function salesFailure(error:unknown,phase:SalesStep):string {
 const causes:Record<string,unknown>[]=[];let current=error;
 for(let i=0;current&&typeof current==="object"&&i<8;i++){const x=current as Record<string,unknown>;if(causes.includes(x))break;causes.push(x);current=x.cause;}
 let reason:string;
 if(causes.some(x=>x.code===4001||x.code==="4001"||x.name==="UserRejectedRequestError")) reason="The wallet request was declined.";
 else if(causes.some(x=>x.code===-32002||x.code==="-32002"))reason="A wallet request is already waiting. Open your wallet to review it.";
 else if(error instanceof SalesError)reason=error.message;
 else {
  const useful=[...causes].reverse().find(x=>typeof x.shortMessage==="string"||typeof x.message==="string");
  reason=useful?safe(String(useful.shortMessage??useful.message)):"The wallet or network did not return a usable response.";
 }
 const recovery=phase==="publishing"?" Your signature may still be valid. Use saved-order recovery instead of signing another listing.":phase==="confirming"?" Check the transaction in recovery before submitting another transaction.":"";
 return `${labels[phase]} failed: ${reason}${recovery}`;
}
