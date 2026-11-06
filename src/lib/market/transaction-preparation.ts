import type { Address, PublicClient } from 'viem';
import { deploymentScope, tokenSalesAbi, type SalesDeployment } from '../blend/sales';
import { nftApproved } from '../blend/sales-chain';
import { readSaleSigningContext } from '../blend/sales-wallet';

// Share the review's reads with the click handler. A cold cache needs only the
// data required to choose an approval or construct a signature, not a full preflight.
export function allowanceOptions(client: PublicClient, d: SalesDeployment, owner: Address, currency: Address, spender: Address) {
  return {queryKey:['transaction-preparation','allowance',deploymentScope(d),owner.toLowerCase(),currency.toLowerCase(),spender.toLowerCase()],
    queryFn:()=>client.readContract({address:currency,abi:tokenSalesAbi,functionName:'allowance',args:[owner,spender]}), staleTime:15_000, retry:false as const};
}
export function nftApprovalOptions(client: PublicClient, d: SalesDeployment, owner: Address, tokenId: bigint) {
  return {queryKey:['transaction-preparation','nft',deploymentScope(d),owner.toLowerCase(),tokenId.toString()],
    queryFn:()=>nftApproved(client,d,owner,tokenId), staleTime:15_000, retry:false as const};
}
export function signingOptions(client: PublicClient, d: SalesDeployment, owner: Address, tokenId: bigint) {
  return {queryKey:['transaction-preparation','signature',deploymentScope(d),owner.toLowerCase(),tokenId.toString()],
    queryFn:()=>readSaleSigningContext(client,d,owner,tokenId), staleTime:15_000, retry:false as const};
}
