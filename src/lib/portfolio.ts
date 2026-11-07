import { useQuery } from '@tanstack/react-query';
import { useActiveAccount } from 'thirdweb/react';
import { formatEther } from 'viem';
import { getMainnetPublicClient } from './wise-stake-start-tx';
import { loadWalletStakePortfolio } from './blend/live-portfolio';
export const ethereumClient = getMainnetPublicClient({batchReads:true});
export function usePortfolio() {
 const account=useActiveAccount();
 return useQuery({queryKey:['portfolio',account?.address.toLowerCase()],enabled:!!account,queryFn:()=>loadWalletStakePortfolio(ethereumClient,account!.address),staleTime:30_000,refetchInterval:60_000});
}
export const WISE_USD_FALLBACK = 0.13;
export function useWiseUsd() {
 return useQuery({queryKey:['wise-usd'],placeholderData:WISE_USD_FALLBACK,queryFn:async()=>{
  try {
   const r=await fetch('/api/wise-price',{signal:AbortSignal.timeout(15_000)});
   if(!r.ok)return WISE_USD_FALLBACK;
   const price=Number((await r.json()).wiseUsd);
   return Number.isFinite(price)&&price>0?price:WISE_USD_FALLBACK;
  } catch { return WISE_USD_FALLBACK; }
 },staleTime:60_000,refetchInterval:60_000});
}
export function wiseAmount(amount?:bigint) { return amount === undefined ? '—' : Number(formatEther(amount)).toLocaleString('en-US',{maximumFractionDigits:6}); }
export function interestAmount(amount?:bigint) {
 if(amount===undefined)return '—';
 if(amount<=0n)return '0.01';
 // Round up to the next 0.01 WISE. 1 WISE = 1e18 wei, so one hundredth is 1e16 wei.
 const cents=(amount+10n**16n-1n)/10n**16n;
 const frac=(cents%100n).toString().padStart(2,'0');
 return `${(cents/100n).toLocaleString('en-US')}.${frac}`;
}
export function yieldPercent(value?:number|null) {
 const shown=value!=null&&Number.isFinite(value)?value:9.12;
 return shown.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function usdAmount(amount:bigint|undefined,price?:number) {
 if(amount===undefined||!price)return 'USD unavailable';
 const value=Number(formatEther(amount))*price;
 return value>0&&value<.01?'≈ <$0.01':`≈ ${value.toLocaleString('en-US',{style:'currency',currency:'USD'})}`;
}
