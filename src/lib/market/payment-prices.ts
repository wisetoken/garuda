import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseAbi } from "viem";
import { ethereumClient, useWiseUsd } from "../portfolio";
import { useEthUsdPrice } from "../use-eth-usd-price";
import type { PaymentPrices } from "../blend/payment-tokens";

const feedAbi = parseAbi(["function decimals() view returns(uint8)", "function description() view returns(string)", "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"]);
// Display estimates only. The signed order always contains exact token units.
export function usePaymentPrices(): PaymentPrices {
  const wise = useWiseUsd(), eth = useEthUsdPrice();
  const usdc = useQuery({queryKey:["payment-usdc-usd"],staleTime:60_000,refetchInterval:60_000,queryFn:async()=>{
    const address = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6" as const;
    const [decimals, description, round] = await Promise.all([
      ethereumClient.readContract({address,abi:feedAbi,functionName:"decimals"}),
      ethereumClient.readContract({address,abi:feedAbi,functionName:"description"}),
      ethereumClient.readContract({address,abi:feedAbi,functionName:"latestRoundData"}),
    ]);
    const now = BigInt(Math.floor(Date.now()/1000));
    if(description !== "USDC / USD" || round[1]<=0n || round[3]===0n || round[3]>now || now-round[3]>93600n || round[4]<round[0]) throw new Error("USDC price unavailable.");
    return Number(formatUnits(round[1],decimals));
  }});
  return {WISE:wise.data,WETH:eth || undefined,USDC:usdc.data};
}
