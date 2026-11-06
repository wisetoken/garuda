import { GarudaPageKicker } from "../GarudaPageKicker";
import { useEthUsdPrice } from '../../lib/use-eth-usd-price';
import { FundingTokenIcon, displayTokenAmount, displayUsd } from './funding-token-display';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ChevronDown, ShieldCheck, Wallet } from 'lucide-react';
import { useWalletAccess } from '../../lib/wallet';
import './wise-funding.css';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { viemAdapter } from 'thirdweb/adapters/viem';
import { defineChain } from 'thirdweb/chains';
import { formatUnits, parseUnits, getAddress, type Hex, type WalletClient } from 'viem';
import { thirdwebClient } from '../../lib/wallet';
import { getMainnetPublicClient } from '../../lib/wise-stake-start-tx';
import { useFundingBalances, firstFundedRoute } from '../../lib/blend/wallet-funding';
import { fundingTokens, quoteFundingInput, quoteWiseFunding, executeWiseFunding, type FundingQuote } from '../../lib/blend/wise-funding';

export function WiseFunding({navigate, embedded=false, shortfall, onBusyChange, onFunded}:{navigate:(screen:string)=>void; embedded?:boolean; shortfall?:bigint; onBusyChange?:(busy:boolean)=>void; onFunded?:()=>void}) {
 const ethUsd=useEthUsdPrice();
 const {connect:openConnectWallet,connecting:isConnecting}=useWalletAccess();
 const tokenTrigger=useRef<HTMLButtonElement>(null);
 const [tokensOpen,setTokensOpen]=useState(false);
 const account=useActiveAccount(), wallet=useActiveWallet();
 const [tokenIndex,setTokenIndex]=useState(0),[amount,setAmount]=useState(''),[slippage,setSlippage]=useState('50');
 const [quote,setQuote]=useState<FundingQuote>(),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[hash,setHash]=useState<Hex>(),[done,setDone]=useState(false);
 const current=useRef({account,wallet});current.current={account,wallet};
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
 const balances=useFundingBalances(account?.address);
 const selectedByUser=useRef(false);
 useEffect(()=>{selectedByUser.current=false;},[account?.address]);
 useEffect(()=>{let cancelled=false;if(balances.data&&!selectedByUser.current&&!busy){void firstFundedRoute(balances.data,shortfall).then(address=>{if(!cancelled&&!selectedByUser.current&&address){setTokenIndex(fundingTokens.findIndex(t=>t.address===address));}});}return()=>{cancelled=true;};},[balances.data,shortfall,busy]);
 const token=fundingTokens[tokenIndex];
 const available=balances.data?.[token.address.toLowerCase()];

 useEffect(()=>{setQuote(undefined);setDone(false);setStatus('');},[tokenIndex,amount,slippage,account?.address]);
 const number=displayTokenAmount;
 async function coverShortfall(){if(!shortfall)return;setBusy(true);setQuote(undefined);setStatus('Calculating the input needed on Uniswap…');try{const input=await quoteFundingInput(getMainnetPublicClient(),token.address,shortfall,Number(slippage));if(mounted.current){setAmount(formatUnits(input,token.decimals));}}catch{if(mounted.current)setStatus('Could not calculate the input. Try another token or enter an amount.');}finally{if(mounted.current)setBusy(false);}}
 async function preview(){setBusy(true);setStatus('Getting a Uniswap quote…');setQuote(undefined);setHash(undefined);try{if((amount.split('.')[1]?.length??0)>token.decimals)throw new Error('Too many decimal places.');const q=await quoteWiseFunding(getMainnetPublicClient(),token.address,parseUnits(amount,token.decimals),Number(slippage));if(mounted.current){setQuote(q);setStatus('Review the minimum WISE received before swapping.');}}catch{if(mounted.current)setStatus('No quote available. Check the amount and try again. This token may not have a usable Uniswap v2 route.');}finally{if(mounted.current)setBusy(false);}}
 async function swap(){if(!quote||!account||!wallet||!thirdwebClient)return;setBusy(true);setDone(false);setHash(undefined);const expected=account.address;const sessionWallet=wallet;const guard=async()=>{if(!mounted.current||current.current.wallet!==sessionWallet||current.current.account?.address.toLowerCase()!==expected.toLowerCase()||sessionWallet.getChain()?.id!==1)throw new Error('Connect the reviewed wallet on Ethereum mainnet.');};try{await executeWiseFunding({client:getMainnetPublicClient(),wallet:viemAdapter.walletClient.toViem({account,client:thirdwebClient,chain:defineChain(1)}) as unknown as WalletClient,address:getAddress(expected),guard,onStep:v=>{if(mounted.current)setStatus(v);},onHash:h=>{if(mounted.current)setHash(h);}},quote);if(mounted.current){setDone(true);onFunded?.();void balances.refetch();setQuote(undefined);setStatus('Swap confirmed. Your WISE is in your wallet. You can now review a purchase or bid.');}}catch(e){if(mounted.current)setStatus(e instanceof Error && !/https?:|Request|Details:/.test(e.message)?e.message:'The action was not completed. Check the transaction link before retrying.');}finally{if(mounted.current)setBusy(false);}}
 const tokenOptions = <div className="funding-wallet-token-options" id={embedded ? undefined : "funding-token-options"} role="group" aria-label="Choose a wallet token" onKeyDown={e=>{if(e.key==='Escape'){setTokensOpen(false);tokenTrigger.current?.focus();}}}>
   {fundingTokens.map((t,i)=>{
     const balance=balances.data?.[t.address.toLowerCase()];
     return <button type="button" key={t.symbol} className="funding-wallet-token-option" aria-pressed={tokenIndex===i} disabled={busy || (!!account && balance===0n)} onClick={()=>{selectedByUser.current=true;setTokenIndex(i);setTokensOpen(false);tokenTrigger.current?.focus();}}>
       <FundingTokenIcon symbol={t.symbol}/>
       <span><strong>{t.symbol}</strong><small>{t.symbol==='ETH'?'Ethereum':t.symbol==='WETH'?'Wrapped Ether':t.symbol==='USDC'?'USD Coin':'Dai'}</small></span>
       <span className="funding-wallet-token-values"><strong title={balance===undefined?undefined:formatUnits(balance,t.decimals)}>{balance===undefined?'—':number(balance,t.decimals)}</strong><small>{account ? displayUsd(balance,t.decimals,t.symbol==='ETH'||t.symbol==='WETH'?ethUsd:1) : 'Connect for balance'}</small></span>
     </button>;
   })}
 </div>;

 if (!embedded) return (
   <section className="wise-funding" aria-labelledby="funding-title">
     <div className="funding-main">
       <div className="funding-intro">
         <GarudaPageKicker label="FUND YOUR NEXT MOVE" description="Swap tokens you already own into WISE. Buy a stake, make a bid, or keep it ready for your next move." />
         <h1 id="funding-title">A little WISE.<br/><span>More possibilities.</span></h1>
         <div className="funding-token-path" aria-label="Convert ETH, WETH, USDC or DAI into WISE">
           <div className="funding-token-stack" aria-hidden="true">{fundingTokens.map(t=><FundingTokenIcon key={t.symbol} symbol={t.symbol}/>)}</div>
           <ArrowRight size={20} aria-hidden="true"/>
           <img src="/wise-token.svg" alt="WISE" width={46} height={46}/>
         </div>
         <ol className="funding-steps">
           <li><span>01</span><div><strong>Choose your token</strong><p>ETH, WETH, USDC or DAI on Ethereum.</p></div></li>
           <li><span>02</span><div><strong>Review your quote</strong><p>See the estimate and minimum WISE you’ll receive.</p></div></li>
           <li><span>03</span><div><strong>Confirm in your wallet</strong><p>Your WISE arrives in the same wallet.</p></div></li>
         </ol>
         <p className="funding-wallet-note"><ShieldCheck size={17} aria-hidden="true"/> You approve every transaction.</p>
       </div>

       <article className="funding-swap" aria-labelledby="funding-swap-title">
         <header className="funding-swap-header">
           <h2 id="funding-swap-title">Swap now</h2>
           <span className="funding-network"><span aria-hidden="true"/> Ethereum</span>
         </header>
         <div className="funding-pay">
           <div className="funding-field-label"><label htmlFor="funding-pay-amount">You pay</label><span>{account ? available===undefined ? 'Balance loading…' : `Balance: ${number(available,token.decimals)}` : 'Wallet not connected'}</span></div>
           <div className="funding-amount-row">
             <input id="funding-pay-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} placeholder="0.00" aria-describedby="funding-pay-help"/>
             <button ref={tokenTrigger} type="button" className="funding-token-select" aria-label={`Pay with ${token.symbol}. Change token`} aria-expanded={tokensOpen} aria-controls="funding-token-options" disabled={busy} onClick={()=>setTokensOpen(v=>!v)}><FundingTokenIcon symbol={token.symbol}/><strong>{token.symbol}</strong><ChevronDown size={16} aria-hidden="true"/></button>
           </div>
           <p id="funding-pay-help">{account && available===undefined ? 'Balance unavailable or loading. Refresh before swapping.' : 'Choose a token and enter an amount.'}</p>
         </div>
         {tokensOpen && <div className="funding-token-picker">{tokenOptions}<small>Approximate USD values. USDC and DAI estimates use $1 per token.</small></div>}
         <div className="funding-direction" aria-hidden="true"><ArrowDown size={18}/></div>
         <div className="funding-receive">
           <div className="funding-field-label"><span>You receive</span><span>Estimated</span></div>
           <div className="funding-amount-row"><output className={quote ? 'funding-output' : 'funding-output funding-output-empty'} aria-label="Estimated WISE received">{quote ? number(quote.output) : '—'}</output><span className="funding-token-fixed"><img src="/wise-token.svg" alt="" width={28} height={28}/><strong>WISE</strong></span></div>
           <p>{quote ? `Minimum received: ${number(quote.minimum)} WISE` : 'Get a quote to see your WISE estimate.'}</p>
         </div>
         <div className="funding-settings"><span>Via Uniswap v2</span><label>Slippage <select value={slippage} disabled={busy} onChange={e=>setSlippage(e.target.value)} aria-label="Slippage limit"><option value="10">0.1%</option><option value="50">0.5%</option><option value="100">1%</option></select></label></div>
         {shortfall !== undefined && shortfall > 0n && <div className="funding-shortfall"><p>WISE needed: {number(shortfall)}. Includes your slippage buffer.</p><button type="button" className="ba-text-button" disabled={busy} onClick={()=>void coverShortfall()}>Calculate {token.symbol} needed</button></div>}
         {quote && <div className="funding-quote-details"><dl><div><dt>Route</dt><dd>{token.symbol}{token.symbol==='ETH'||token.symbol==='WETH'?'':' → WETH'} → WISE</dd></div></dl><p>Quote valid for two minutes. Ethereum gas is separate.</p>{shortfall !== undefined && quote.minimum < shortfall && <p>This amount no longer covers the shortfall. Calculate the amount again before swapping.</p>}</div>}
         {quote ? <>
           {account ? <button type="button" className="ba-primary funding-primary" disabled={busy||available===undefined||quote.amount>available||(shortfall !== undefined && quote.minimum < shortfall)} onClick={()=>void swap()}>{busy ? 'Check your wallet…' : 'Approve if needed & swap'}<ArrowRight size={18} aria-hidden="true"/></button> : <button type="button" className="ba-primary funding-primary" disabled={busy||isConnecting} onClick={()=>void openConnectWallet()}><Wallet size={18} aria-hidden="true"/>Connect wallet to swap</button>}
           <button type="button" className="funding-refresh" disabled={busy} onClick={()=>void preview()}>Refresh quote</button>
         </> : <button type="button" className="ba-primary funding-primary" disabled={busy||!/^\d+(\.\d+)?$/.test(amount)||Number(amount)<=0} onClick={()=>void preview()}>{busy ? 'Getting your quote…' : 'Get quote'}<ArrowRight size={18} aria-hidden="true"/></button>}
         {!account && !quote && <button type="button" className="funding-connect" disabled={isConnecting||busy} onClick={()=>void openConnectWallet()}><Wallet size={14} aria-hidden="true"/> Connect wallet to view your balances</button>}
         <p className="funding-status" role="status">{status}</p>
         {hash && <a className="funding-transaction" href={`https://etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View submitted transaction ↗</a>}
         {done && <button type="button" className="ba-primary funding-primary" onClick={()=>navigate('trade')}>Continue to market <ArrowRight size={18} aria-hidden="true"/></button>}
         <details className="funding-info"><summary>Fees & supported routes <ChevronDown size={15} aria-hidden="true"/></summary><p>No Garuda swap fee. Pool fees are included in the quote; Ethereum gas is paid separately. ETH, WETH, USDC and DAI use Uniswap v2 routes through WETH, subject to liquidity.</p></details>
       </article>
     </div>
   </section>
 );

 // Embedded swaps stay separate from the purchase form's submit action.
 return <section className="garuda-buy-swap" aria-label="Get WISE for this purchase" onKeyDown={e=>{if(e.key==='Enter' && e.target instanceof HTMLInputElement){e.preventDefault();if(!busy && /^\d+(\.\d+)?$/.test(amount) && Number(amount)>0)void preview();}}}>
   <div className="garuda-buy-swap-pay">
     <label htmlFor="buy-funding-amount">You pay</label>
     <div className="garuda-buy-swap-amount">
       <input id="buy-funding-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} placeholder="0.00" />
       <div className="garuda-buy-swap-token"><FundingTokenIcon symbol={token.symbol}/><select aria-label="Funding token" value={tokenIndex} disabled={busy} onChange={e=>{selectedByUser.current=true;setTokenIndex(Number(e.target.value));}}>{fundingTokens.map((t,i)=><option key={t.symbol} value={i} disabled={!!account && balances.data?.[t.address.toLowerCase()]===0n}>{t.symbol}</option>)}</select></div>
     </div>
     <small>{account ? available===undefined ? 'Balance unavailable or loading.' : `Available: ${number(available,token.decimals)} ${token.symbol}` : 'Connect your wallet to see your balance.'}</small>
   </div>
   {shortfall !== undefined && shortfall > 0n && <div className="garuda-buy-swap-needed"><span>Need {number(shortfall)} WISE</span><button type="button" disabled={busy} onClick={()=>void coverShortfall()}>Calculate {token.symbol} needed</button></div>}
   <div className="garuda-buy-swap-settings"><span>Via Uniswap v2</span><label>Slippage<select aria-label="Slippage limit" value={slippage} disabled={busy} onChange={e=>setSlippage(e.target.value)}><option value="10">0.1%</option><option value="50">0.5%</option><option value="100">1%</option></select></label></div>
   {quote && <div className="garuda-buy-swap-quote"><dl><div><dt>Estimated WISE</dt><dd>{number(quote.output)}</dd></div><div><dt>Minimum received</dt><dd><strong>{number(quote.minimum)} WISE</strong></dd></div></dl>
     {shortfall !== undefined && quote.minimum < shortfall && <p>This amount no longer covers the shortfall. Calculate the amount again before swapping.</p>}
     <p>{token.symbol}{token.symbol==='ETH'||token.symbol==='WETH'?'':' → WETH'} → WISE · Quote valid for two minutes. Ethereum gas is separate. No Garuda swap fee; pool fees are included.</p>
   </div>}
   {quote ? <>
     {account ? <button type="button" className="btn-base btn-primary garuda-buy-swap-action" disabled={busy||available===undefined||quote.amount>available||(shortfall !== undefined && quote.minimum < shortfall)} onClick={()=>void swap()}>{busy?'Check your wallet…':'Approve if needed & swap'}</button> : <button type="button" className="btn-base btn-primary garuda-buy-swap-action" disabled={busy||isConnecting} onClick={()=>void openConnectWallet()}>Connect wallet to swap</button>}
     <button type="button" className="garuda-buy-swap-refresh" disabled={busy} onClick={()=>void preview()}>Refresh quote</button>
   </> : <button type="button" className="btn-base btn-secondary garuda-buy-swap-action" disabled={busy||!/^\d+(\.\d+)?$/.test(amount)||Number(amount)<=0} onClick={()=>void preview()}>{busy?'Getting quote…':'Get swap quote'}</button>}
   <p className="garuda-buy-swap-status" role="status">{status}</p>
   {hash && <a href={`https://etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View submitted transaction ↗</a>}
 </section>;
}
