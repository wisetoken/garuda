import { paymentToken, formatPaymentAmount } from "../../lib/blend/payment-tokens";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, Check, ChevronDown } from "lucide-react";
import { formatUnits, type Address, type Hex } from "viem";
import { ethereumClient } from "../../lib/portfolio";
import { useFundingBalances } from "../../lib/blend/wallet-funding";
import { purchaseFundingTokens } from "../../lib/market/purchase-funding";
import { quotePurchasePayment, type PaymentReviewState } from "../../lib/market/purchase-payment";
import type { SalesDeployment } from "../../lib/blend/sales";
import { FundingTokenIcon, displayTokenAmount } from "../funding/funding-token-display";
import "./purchase-funding.css";

type Props = {
  currency: Address; buyer?: Address; orderHash: Hex; price: bigint; payWith: Address;
  onPayWithChange: (token: Address) => void;
  busy: boolean; blocked: boolean; deployment?: SalesDeployment;
  onReviewChange: (state: PaymentReviewState) => void;
};

export function PurchaseFunding(props: Props) {
  const { currency, payWith, price, buyer, orderHash, busy, onPayWithChange } = props;
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId();
  const target = paymentToken(currency);
  const token = purchaseFundingTokens.find(t => t.address === payWith) ?? target;
  const choices = [target, ...purchaseFundingTokens.filter(t => t.address !== currency)];
  const balances = useFundingBalances(buyer);
  useEffect(() => {
    if (!open) return;
    picker.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    const outside = (event: PointerEvent) => { if (!picker.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <section className="purchase-payment" aria-label="Purchase payment">
    <div className="purchase-price-line">
      <div><p className="sale-label">Asking price</p><p className="sale-total">{formatPaymentAmount(price, currency)} <small>{target.symbol}</small></p></div>
      <div className="purchase-funding-picker" ref={picker}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
        onKeyDown={event => {
          if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
          if (open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            const items = [...picker.current!.querySelectorAll<HTMLButtonElement>(".purchase-funding-options button")];
            const i = items.indexOf(document.activeElement as HTMLButtonElement);
            items[(i + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
          }
        }}>
        <span className="purchase-pay-label">Pay with</span>
        <button type="button" className="purchase-funding-token" ref={trigger} disabled={busy}
          aria-label={`Pay with ${token.symbol}`} aria-expanded={open} aria-controls={open ? id : undefined}
          onClick={() => setOpen(value => !value)}><FundingTokenIcon symbol={token.symbol}/>{token.symbol}<ChevronDown size={16} aria-hidden="true"/></button>
        {open && <div className="purchase-funding-options" id={id} role="group" aria-label="Payment token">
          <p>Pay with <span>Wallet balance</span></p>
          {choices.map(option => {
            const balance = balances.data?.[option.address.toLowerCase()];
            return <button key={option.address} type="button" aria-pressed={option.address === payWith} disabled={busy}
              onClick={() => { onPayWithChange(option.address); setOpen(false); trigger.current?.focus(); }}>
              <FundingTokenIcon symbol={option.symbol}/><span>{option.symbol}</span>{option.address === payWith && <Check size={14} aria-hidden="true"/>}
              <small>{balance === undefined ? "—" : displayTokenAmount(balance, option.decimals)}</small>
            </button>;
          })}
          <p className="purchase-picker-note">Buy using another token. The seller receives {target.symbol}.</p>
        </div>}
      </div>
    </div>
    {payWith !== currency && <FundingReview key={`${buyer}:${orderHash}:${payWith}:${currency}`} {...props}/>}
  </section>;
}

function FundingReview({ currency, buyer, orderHash, price, payWith, busy, blocked, deployment, onReviewChange }: Props) {
  const target = paymentToken(currency), token = purchaseFundingTokens.find(t => t.address === payWith)!;
  const [slippage, setSlippage] = useState(50), [expired, setExpired] = useState(false);
  const balances = useFundingBalances(buyer);
  const available = balances.data?.[payWith.toLowerCase()];
  const quotes = useQuery({
    queryKey: ["purchase-payment-quote", buyer, orderHash, currency, payWith, price.toString(), slippage, deployment?.purchaseRouter?.address],
    queryFn: () => quotePurchasePayment(ethereumClient, deployment!, {currency, buyer: buyer!, orderHash, amount: price, inputToken: payWith, slippage}),
    enabled: !!buyer && !!deployment?.purchaseRouter && !blocked && !busy,
    retry: false, staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const quote = quotes.isError ? undefined : quotes.data;
  useEffect(() => {
    setExpired(false);
    if (!quote) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, quote.expires - Date.now()));
    return () => window.clearTimeout(timer);
  }, [quote]);
  const insufficient = quote && available !== undefined && quote.maxInput > available;
  const usable = !!quote && !expired && !quotes.isFetching;
  const wrap = token.symbol === "ETH" && target.symbol === "WETH";
  useEffect(() => {
    onReviewChange({quote:usable ? quote : undefined,loading:quotes.isFetching,insufficient:!!insufficient,unknownBalance:available===undefined,expired});
  }, [quote, usable, quotes.isFetching, insufficient, available, expired, onReviewChange]);
  return <div className="purchase-funding-review">
    <div className="purchase-funding-pay">
      <div className="purchase-funding-label"><span>Estimated payment · {token.symbol}</span><span>{!buyer ? "Connect wallet" : available === undefined ? (balances.isFetching ? "Checking balance…" : "Balance unavailable") : `Balance: ${displayTokenAmount(available, token.decimals)}`}</span></div>
      <div className="purchase-funding-amount"><strong title={quote ? formatUnits(quote.estimatedInput, token.decimals) : undefined}>{quote ? displayTokenAmount(quote.estimatedInput, token.decimals) : "—"} <small>{token.symbol}</small></strong></div>
    </div>
    <div className="purchase-funding-receive"><ArrowDown size={16} aria-hidden="true"/><span>Seller’s asking price</span><strong>{formatPaymentAmount(price,currency,6)} {target.symbol}</strong></div>
    {!wrap && <div className="purchase-funding-slippage"><span>Slippage</span><div role="group" aria-label="Swap slippage">{[10, 50, 100].map(value => <button key={value} type="button" disabled={busy} aria-pressed={slippage === value} onClick={() => setSlippage(value)}>{value / 100}%</button>)}</div></div>}
    {quote && <div className="purchase-funding-receive"><span>Maximum payment</span><strong>{displayTokenAmount(quote.maxInput, token.decimals)} {token.symbol}</strong></div>}
    <p className="purchase-funding-note">Pay in {token.symbol}. Uniswap supplies the exact {target.symbol} for this purchase, and unused payment is returned. If the purchase fails, the swap reverts too. Gas is separate.</p>
    {!deployment?.purchaseRouter && <p className="purchase-funding-note">Other payment tokens will be available for new listings after the market update.</p>}
    {quotes.isError && <p className="purchase-funding-error" role="alert">Could not get a payment quote. Try again or choose another token.</p>}
    {!!deployment?.purchaseRouter && <button type="button" className="purchase-funding-refresh" disabled={busy || blocked || !buyer || quotes.isFetching} onClick={() => void quotes.refetch()}>{quotes.isFetching ? "Getting payment quote…" : expired ? "Quote expired · refresh" : usable ? "Refresh quote · valid for 2 minutes" : "Get payment quote"}</button>}
    {buyer && available === undefined && <button type="button" className="purchase-funding-refresh" disabled={busy || balances.isFetching} onClick={() => void balances.refetch()}>{balances.isFetching ? "Checking balances…" : "Retry token balances"}</button>}
  </div>;
}
