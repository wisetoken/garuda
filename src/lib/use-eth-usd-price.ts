import { useQuery } from '@tanstack/react-query';
import { parseAbi, formatUnits } from 'viem';
import { getMainnetPublicClient } from './wise-stake-start-tx';
const abi = parseAbi(['function decimals() view returns(uint8)', 'function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)']);
export function useEthUsdPrice() {
 const query = useQuery({queryKey:['funding-eth-usd'],staleTime:60000,queryFn:async()=>{
  const client=getMainnetPublicClient();
  const address='0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419' as const;
  const [decimals,round]=await Promise.all([client.readContract({address,abi,functionName:'decimals'}),client.readContract({address,abi,functionName:'latestRoundData'})]);
  if(round[1]<=0n || round[3]===0n || Date.now()/1000-Number(round[3])>7200) return 0;
  return Number(formatUnits(round[1],decimals));
 }});
 return query.data ?? 0;
}
