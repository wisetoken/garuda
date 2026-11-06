import { paymentToken, formatPaymentAmount } from "../../lib/blend/payment-tokens";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import { formatUnits, type Address, type Hex } from "viem";
import { ethereumClient } from "../../lib/portfolio";
import { useFundingBalances } from "../../lib/blend/wallet-funding";
import { purchaseFundingTokens } from "../../lib/market/purchase-funding";
import { quotePurchasePayment, type PaymentReviewState } from "../../lib/market/purchase-payment";
import type { SalesDeployment } from "../../lib/blend/sales";
import { FundingTokenIcon, displayTokenAmount } from "../funding/funding-token-display";
import { PaymentDetailsDrawer } from "./PaymentDetailsDrawer";
import "./purchase-funding.css";

type Props = {
  currency: Address; buyer?: Address; orderHash: Hex; price: bigint; payWith: Address;
  onPayWithChange: (token: Address) => void;
  busy: boolean; blocked: boolean; deployment?: SalesDeployment;
  onReviewChange: (state: PaymentReviewState) => void;
};

export function PurchaseFunding(props: Props) {
  const { currency, payWith, price, buyer, orderHash, busy, blocked, deployment, onPayWithChange, onReviewChange } = props;
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false), detailsId = useId();
  const picker = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId();
  const target = paymentToken(currency);
  const token = purchaseFundingTokens.find(t => t.address === payWith) ?? target;
  const choices = [target, ...purchaseFundingTokens.filter(t => t.address !== currency)];
  const balances = useFundingBalances(buyer);
  const converting = payWith !== currency;
  const [slippage, setSlippage] = useState(50), [expired, setExpired] = useState(false);
  const available = balances.data?.[payWith.toLowerCase()];
  const quotes = useQuery({
    queryKey: ["purchase-payment-quote", buyer, orderHash, currency, payWith, price.toString(), slippage, deployment?.purchaseRouter?.address],
    queryFn: () => quotePurchasePayment(ethereumClient, deployment!, {currency, buyer: buyer!, orderHash, amount: price, inputToken: payWith, slippage}),
    enabled: converting && !!buyer && !!deployment?.purchaseRouter && !blocked && !busy,
    retry: false, staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const quote = converting && !quotes.isError ? quotes.data : undefined;
  useEffect(() => {
    setExpired(false);
    if (!quote) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, quote.expires - Date.now()));
    return () => window.clearTimeout(timer);
  }, [quote]);
  const insufficient = quote && available !== undefined && quote.maxInput > available;
  const usable = !!quote && !expired && !quotes.isFetching;
  useEffect(() => {
    onReviewChange({quote:usable ? quote : undefined,loading:quotes.isFetching,insufficient:!!insufficient,unknownBalance:available===undefined,expired});
  }, [quote, usable, quotes.isFetching, insufficient, available, expired, onReviewChange]);
  useEffect(() => {
    if (!open) return;
    picker.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    const outside = (event: PointerEvent) => { if (!picker.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <section className="purchase-payment" aria-label="Purchase payment">
    <div className="purchase-price-line">
      <div className="purchase-price-amount">
        <p className="sale-label">{converting ? "Estimated payment" : "Asking price"}</p>
        <p className="sale-total" aria-live="polite" aria-busy={converting && quotes.isFetching}
          title={quote && !expired ? formatUnits(quote.estimatedInput, token.decimals) : undefined}>
          {converting ? quote && !expired ? displayTokenAmount(quote.estimatedInput, token.decimals)
            : quotes.isFetching ? <LoaderCircle className="sale-loading" size={26} aria-label="Getting payment quote"/> : "—"
            : formatPaymentAmount(price, currency)} <small>{token.symbol}</small>
        </p>
      </div>
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
          <p className="purchase-picker-note">Buy using another token through Uniswap.</p>
        </div>}
      </div>
    </div>
    {converting && <>
      {quotes.isError && <p className="purchase-funding-error" role="alert">Quote unavailable. <button type="button" disabled={busy || blocked || quotes.isFetching} onClick={() => void quotes.refetch()}>Try again</button></p>}
      {expired && !quotes.isError && <p className="purchase-quote-status" role="status"><button type="button" disabled={busy || blocked || quotes.isFetching} onClick={() => void quotes.refetch()}>{quotes.isFetching ? "Updating quote…" : "Quote expired · refresh"}</button></p>}
      <button type="button" className="purchase-payment-details" aria-haspopup="dialog" aria-expanded={detailsOpen} aria-controls={detailsId}
        onClick={() => setDetailsOpen(true)}>Payment details <ChevronRight size={15} aria-hidden="true"/></button>
      <PaymentDetailsDrawer id={detailsId} open={detailsOpen} onClose={() => setDetailsOpen(false)}
        currency={currency} payWith={payWith} price={price} router={deployment?.purchaseRouter?.address}
        quote={quote} loading={quotes.isFetching} expired={expired} error={quotes.isError}
        slippage={slippage} onSlippageChange={setSlippage} busy={busy}
        balance={!buyer ? "Connect wallet" : available === undefined ? (balances.isFetching ? "Checking…" : "Unavailable") : `${displayTokenAmount(available, token.decimals)} ${token.symbol}`}
        onRetryBalance={buyer && available === undefined && !busy && !balances.isFetching ? () => void balances.refetch() : undefined}
        canRefresh={!!deployment?.purchaseRouter && !!buyer && !busy && !blocked && !quotes.isFetching}
        onRefresh={() => void quotes.refetch()}/>
    </>}
  </section>;
}
