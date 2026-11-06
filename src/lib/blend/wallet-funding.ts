import { useQuery } from '@tanstack/react-query';
import { getAddress, zeroAddress, type Address } from 'viem';
import { getMainnetPublicClient } from '../wise-stake-start-tx';
import { FUNDING_WISE, fundingTokens, fundingTokenAbi, quoteWiseFunding } from './wise-funding';

// Unknown/failed balances remain unknown, never an invented zero.
export function useFundingBalances(address?:string) {
 return useQuery({queryKey:['garuda-funding-balances',address?.toLowerCase()],enabled:!!address,refetchInterval:15000,
 queryFn:async()=>{
  const client=getMainnetPublicClient(),owner=getAddress(address!);
  const tokens=[{address:FUNDING_WISE},...fundingTokens];
  const values=await Promise.allSettled(tokens.map(t=>t.address===zeroAddress?client.getBalance({address:owner}):client.readContract({address:t.address,abi:fundingTokenAbi,functionName:'balanceOf',args:[owner]})));
  return Object.fromEntries(tokens.map((t,i)=>[t.address.toLowerCase(),values[i].status==='fulfilled'?(values[i] as PromiseFulfilledResult<bigint>).value:undefined])) as Record<string,bigint|undefined>;
 }});
}
export async function firstFundedRoute(balances:Record<string,bigint|undefined>,shortfall?:bigint):Promise<Address|undefined> {
 for(const token of fundingTokens){
  const balance=balances[token.address.toLowerCase()];
  if(!balance || balance<=0n)continue;
  // Keep native ETH in the wallet for gas; final simulation still verifies affordability.
  const probe=token.address===zeroAddress?balance/2n:balance;
  if(probe===0n)continue;
  try { const quote=await quoteWiseFunding(getMainnetPublicClient(),token.address,probe);
   if(!shortfall || quote.minimum>=shortfall)return token.address;
  } catch { /* A balance alone is not proof of a usable route. */ }
 }
 return undefined;
}
