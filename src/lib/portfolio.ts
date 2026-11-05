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
export function useWiseUsd() {
 return useQuery({queryKey:['wise-usd'],queryFn:async()=>{const r=await fetch('/api/wise-price',{signal:AbortSignal.timeout(15_000)});if(!r.ok)throw new Error('Price unavailable');const d=await r.json();if(!Number.isFinite(Number(d.wiseUsd))||Number(d.wiseUsd)<=0)throw new Error('Price unavailable');return Number(d.wiseUsd);},staleTime:60_000,refetchInterval:60_000});
}
export function wiseAmount(amount?:bigint) { return amount === undefined ? '—' : Number(formatEther(amount)).toLocaleString('en-US',{maximumFractionDigits:6}); }
export function usdAmount(amount:bigint|undefined,price?:number) {
 if(amount===undefined||!price)return 'USD unavailable';
 const value=Number(formatEther(amount))*price;
 return value>0&&value<.01?'≈ <$0.01':`≈ ${value.toLocaleString('en-US',{style:'currency',currency:'USD'})}`;
}
