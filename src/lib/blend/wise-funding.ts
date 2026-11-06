import { getAddress, parseAbi, zeroAddress, type Address, type PublicClient, type WalletClient, type Hex } from "viem";
export const FUNDING_WISE = getAddress('0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6');
export const FUNDING_WETH = getAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
export const FUNDING_ROUTER = getAddress('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D');
export const fundingTokens = [
 {symbol:'ETH',address:zeroAddress,decimals:18},
 {symbol:'WETH',address:FUNDING_WETH,decimals:18},
 {symbol:'USDC',address:getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),decimals:6},
 {symbol:'DAI',address:getAddress('0x6B175474E89094C44Da98b954EedeAC495271d0F'),decimals:18},
] as const;
export const fundingRouterAbi = parseAbi([
 'function factory() view returns(address)', 'function WETH() view returns(address)',
 'function getAmountsIn(uint256,address[]) view returns(uint256[])',
 'function getAmountsOut(uint256,address[]) view returns(uint256[])',
 'function swapExactETHForTokens(uint256,address[],address,uint256) payable returns(uint256[])',
 'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns(uint256[])',
]);
export const fundingTokenAbi = parseAbi(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)']);
export function fundingPath(token: Address): Address[] {
 const input = getAddress(token);
 if(input===FUNDING_WISE) throw new Error('This wallet token is already WISE.');
 return input === zeroAddress || input === FUNDING_WETH ? [FUNDING_WETH,FUNDING_WISE] : [input,FUNDING_WETH,FUNDING_WISE];
}
export function minimumFundingOutput(amount:bigint,bps:number) {
 if(amount<=0n || !Number.isInteger(bps) || bps<10 || bps>300) throw new Error('Choose slippage between 0.1% and 3%.');
 const min=amount*BigInt(10000-bps)/10000n;
 if(min===0n) throw new Error('Swap amount is too small.');
 return min;
}
export type FundingQuote={ token:Address; amount:bigint; output:bigint; minimum:bigint; path:Address[]; block:bigint; expires:number; slippage:number };
export async function quoteWiseFunding(client:PublicClient,token:Address,amount:bigint,bps=50):Promise<FundingQuote> {
 if(await client.getChainId()!==1) throw new Error('Use Ethereum mainnet.');
 if(amount<=0n) throw new Error('Enter a positive amount.');
 const path=fundingPath(token); const block=await client.getBlockNumber();
 const [factory,weth]=await Promise.all([
 client.readContract({address:FUNDING_ROUTER,abi:fundingRouterAbi,functionName:'factory',blockNumber:block}),
 client.readContract({address:FUNDING_ROUTER,abi:fundingRouterAbi,functionName:'WETH',blockNumber:block})]);
 if(factory.toLowerCase()!=='0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f' || getAddress(weth)!==FUNDING_WETH) throw new Error('Unexpected Uniswap router configuration.');
 const amounts=await client.readContract({address:FUNDING_ROUTER,abi:fundingRouterAbi,functionName:'getAmountsOut',args:[amount,path],blockNumber:block});
 const output=amounts[amounts.length-1];
 return {token,amount,output,minimum:minimumFundingOutput(output,bps),path,block,expires:Date.now()+120000,slippage:bps};
}
export async function executeWiseFunding(s:{client:PublicClient;wallet:WalletClient;address:Address;guard:()=>Promise<void>;onStep:(s:string)=>void;onHash:(hash:Hex)=>void},q:FundingQuote) {
 const check=async()=>{await s.guard();if(await s.client.getChainId()!==1 || await s.wallet.getChainId()!==1 || s.wallet.account?.address.toLowerCase()!==s.address.toLowerCase()) throw new Error('Wallet or network changed. Review again.');if(Date.now()>q.expires) throw new Error('Quote expired. Refresh and review again.');};
 await check();
 const native=q.token===zeroAddress;
 const balance=native?await s.client.getBalance({address:s.address}):await s.client.readContract({address:q.token,abi:fundingTokenAbi,functionName:'balanceOf',args:[s.address]});
 if(balance<q.amount) throw new Error('Insufficient balance. Keep ETH for gas as well.');
 if(!native) {
 const allowance=await s.client.readContract({address:q.token,abi:fundingTokenAbi,functionName:'allowance',args:[s.address,FUNDING_ROUTER]});
 if(allowance<q.amount) {
 await check();s.onStep('Approve the exact input amount in your wallet.');
 const {request}=await s.client.simulateContract({account:s.address,address:q.token,abi:fundingTokenAbi,functionName:'approve',args:[FUNDING_ROUTER,q.amount]});
 await check();const hash=await s.wallet.writeContract({...request,account:s.wallet.account!,chain:s.wallet.chain} as Parameters<WalletClient["writeContract"]>[0]);s.onHash(hash);
 const receipt=await s.client.waitForTransactionReceipt({hash,timeout:180000});if(receipt.status!=='success') throw new Error('Approval reverted.');
 }
 }
 await check();s.onStep('Review and confirm the swap in your wallet.');
 const deadline=BigInt(Math.floor(q.expires/1000));
 const {request}=native
 ? await s.client.simulateContract({account:s.address,address:FUNDING_ROUTER,abi:fundingRouterAbi,functionName:'swapExactETHForTokens',args:[q.minimum,q.path,s.address,deadline],value:q.amount})
 : await s.client.simulateContract({account:s.address,address:FUNDING_ROUTER,abi:fundingRouterAbi,functionName:'swapExactTokensForTokens',args:[q.amount,q.minimum,q.path,s.address,deadline]});
 await check();const hash=await s.wallet.writeContract({...request,account:s.wallet.account!,chain:s.wallet.chain} as Parameters<WalletClient["writeContract"]>[0]);s.onHash(hash);s.onStep('Swap submitted. Waiting for Ethereum confirmation.');
 const receipt=await s.client.waitForTransactionReceipt({hash,timeout:180000});if(receipt.status!=='success') throw new Error('Swap reverted.');return hash;
}

// Round up the target so an exact-input swap's slippage floor covers the shortfall.
export function fundingTargetWithBuffer(shortfall:bigint,bps:number):bigint {
 if(shortfall<=0n || !Number.isInteger(bps) || bps<10 || bps>300) throw new Error('Invalid funding target or slippage.');
 const denominator=BigInt(10000-bps);
 return (shortfall*10000n+denominator-1n)/denominator;
}
export async function quoteFundingInput(client:PublicClient,token:Address,shortfall:bigint,bps=50):Promise<bigint> {
 if(await client.getChainId()!==1) throw new Error('Use Ethereum mainnet.');
 const target=fundingTargetWithBuffer(shortfall,bps);
 const amounts=await client.readContract({address:FUNDING_ROUTER,abi:fundingRouterAbi,functionName:'getAmountsIn',args:[target,fundingPath(token)]});
 if(!amounts[0] || amounts[0]<=0n) throw new Error('No usable funding route.');
 return amounts[0];
}
