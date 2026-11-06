import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, LoaderCircle, RefreshCw, X } from "lucide-react";
import { formatUnits, zeroAddress, type Address } from "viem";
import { paymentToken, formatPaymentAmount } from "../../lib/blend/payment-tokens";
import { FUNDING_ROUTER, fundingPath } from "../../lib/blend/wise-funding";
import { purchaseFundingTokens } from "../../lib/market/purchase-funding";
import type { PurchasePaymentQuote } from "../../lib/market/purchase-payment";
import { FundingTokenIcon, displayTokenAmount } from "../funding/funding-token-display";
import "./payment-details-drawer.css";

type Props = {
  id: string; open: boolean; onClose: () => void;
  currency: Address; payWith: Address; price: bigint; router?: Address;
  quote?: PurchasePaymentQuote; loading: boolean; expired: boolean; error: boolean;
  slippage: number; onSlippageChange: (value: number) => void; busy: boolean;
  balance: string; onRetryBalance?: () => void;
  canRefresh: boolean; onRefresh: () => void;
};

export function PaymentDetailsDrawer({
  id, open, onClose, currency, payWith, price, router, quote, loading, expired, error,
  slippage, onSlippageChange, busy, balance, onRetryBalance, canRefresh, onRefresh,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null), backdropPress = useRef(false);
  const headingId = useId();
  const [now, setNow] = useState(Date.now);
  const target = paymentToken(currency);
  const token = purchaseFundingTokens.find(item => item.address === payWith)!;
  // Use the same path as the quote and purchase router, including native ETH wrapping.
  const path = fundingPath(payWith, currency);
  const wrapOnly = path.length === 1;
  const route = [...(payWith === zeroAddress ? [token] : []), ...path.map(paymentToken)];
  const fresh = quote && !expired && quote.expires > now;
  const seconds = quote ? Math.max(0, Math.ceil((quote.expires - now) / 1000)) : 0;

  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    if (!open && element?.open) element.close();
    return () => { if (element?.open) element.close(); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, quote?.expires]);

  return <dialog ref={dialog} id={id} className="payment-details-drawer" aria-labelledby={headingId}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onClose={event => event.stopPropagation()}
    onPointerDown={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      backdropPress.current = event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
    }}
    onClick={event => { if (backdropPress.current && event.target === event.currentTarget) onClose(); backdropPress.current = false; }}>
    <header className="payment-drawer-header">
      <div><h2 id={headingId}>Payment details</h2><p>Your purchase on Ethereum</p></div>
      <button type="button" className="payment-drawer-close" aria-label="Close payment details" onClick={onClose}><X size={18}/></button>
    </header>

    <div className="payment-drawer-body">
      <div className="payment-drawer-provider">
        {wrapOnly ? <FundingTokenIcon symbol="WETH"/> : <img src="/images/icons/uniswap.svg" width="36" height="36" alt=""/>}
        <div><span>{wrapOnly ? "Native token wrapping" : "Powered by"}</span><strong>{wrapOnly ? "ETH → WETH" : "Uniswap v2"}</strong></div>
        <span className="payment-drawer-network">Ethereum</span>
      </div>

      <section className="payment-drawer-quote" aria-label="Payment quote">
        <div className="payment-drawer-quote-label"><span>You pay · estimated</span><FundingTokenIcon symbol={token.symbol}/></div>
        <p className="payment-drawer-amount" aria-live="polite" aria-busy={loading}
          title={fresh ? formatUnits(quote.estimatedInput, token.decimals) : undefined}>
          {fresh ? displayTokenAmount(quote.estimatedInput, token.decimals) : loading ? <LoaderCircle className="sale-loading" size={24} aria-label="Getting quote"/> : "—"} <small>{token.symbol}</small>
        </p>
        <div className="payment-drawer-listing"><span>Listing payment</span><strong>{formatPaymentAmount(price, currency, 6)} {target.symbol}</strong></div>
        <div className="payment-drawer-validity">
          <span>{loading ? "Updating quote…" : error ? "Quote unavailable" : expired || (quote && !fresh) ? "Quote expired" : fresh ? `Valid for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Waiting for a quote"}</span>
          <button type="button" aria-label="Refresh payment quote" disabled={!canRefresh} onClick={onRefresh}><RefreshCw size={12} className={loading ? "sale-loading" : undefined}/> Refresh</button>
        </div>
      </section>

      <section className="payment-drawer-route" aria-labelledby={`${headingId}-route`}>
        <div className="payment-drawer-section-heading"><h3 id={`${headingId}-route`}>Payment route</h3><span>{wrapOnly ? "Wrap only" : "Exact output"}</span></div>
        <ol>{route.map((step, index) => <li key={`${step.address}-${index}`}>
          {index > 0 && <div className="payment-route-hop" aria-label={index === 1 && payWith === zeroAddress ? "Wrap ETH into WETH" : "Swap through Uniswap v2"}><ArrowRight size={16} aria-hidden="true"/><small>{index === 1 && payWith === zeroAddress ? "Wrap" : "Swap"}</small></div>}
          <div className="payment-route-token"><FundingTokenIcon symbol={step.symbol}/><strong>{step.symbol}</strong></div>
        </li>)}</ol>
        <p>{wrapOnly ? "ETH is wrapped into WETH as part of your purchase. No swap is needed." : `Uniswap supplies the exact ${target.symbol} needed. The swap and stake purchase complete together.`}</p>
      </section>

      <section className="payment-drawer-settings" aria-label="Payment settings">
        {!wrapOnly && <div className="payment-drawer-slippage"><span>Slippage tolerance</span><div role="group" aria-label="Swap slippage">{[10, 50, 100].map(value => <button key={value} type="button" disabled={busy} aria-pressed={slippage === value} onClick={() => onSlippageChange(value)}>{value / 100}%</button>)}</div></div>}
        <dl>
          <div><dt>Maximum payment</dt><dd title={fresh ? formatUnits(quote.maxInput, token.decimals) : undefined}>{fresh ? `${displayTokenAmount(quote.maxInput, token.decimals)} ${token.symbol}` : "—"}</dd></div>
          <div><dt>Wallet balance</dt><dd>{balance}{onRetryBalance && <button type="button" className="payment-balance-retry" onClick={onRetryBalance}>Retry</button>}</dd></div>
          <div><dt>Network fee</dt><dd>Paid separately in ETH</dd></div>
        </dl>
        <p>Unused payment is returned to your wallet.</p>
        {!router && <p role="status">Other payment tokens are unavailable for this listing.</p>}
      </section>

      <nav className="payment-drawer-references" aria-label="Payment references">
        {!wrapOnly && <>
          <a href="https://developers.uniswap.org/docs/protocols/v2/overview" target="_blank" rel="noopener noreferrer"><img src="/images/icons/uniswap.svg" alt="" width="18" height="18"/><span>About Uniswap v2</span><ExternalLink size={13}/></a>
          <a href={`https://etherscan.io/address/${FUNDING_ROUTER}#code`} target="_blank" rel="noopener noreferrer"><span>Uniswap router contract</span><ExternalLink size={13}/></a>
        </>}
        {router && <a href={`https://etherscan.io/address/${router}#code`} target="_blank" rel="noopener noreferrer"><span>Garuda payment contract</span><ExternalLink size={13}/></a>}
      </nav>
    </div>

    <footer className="payment-drawer-footer"><button type="button" onClick={onClose}><ArrowLeft size={16}/> Back to purchase</button></footer>
  </dialog>;
}
