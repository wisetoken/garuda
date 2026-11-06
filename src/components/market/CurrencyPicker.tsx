import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Address } from 'viem';
import { paymentToken, formatTokenBalance, paymentUsd, type PaymentToken, type PaymentPrices } from '../../lib/blend/payment-tokens';
import { FundingTokenIcon } from '../funding/funding-token-display';

type CurrencyPickerProps = { disabled?: boolean; value: Address; tokens: readonly PaymentToken[]; onChange: (value: Address) => void; balances?: Record<string, bigint | undefined>; prices: PaymentPrices };

export function CurrencyPicker({ disabled = false, value, tokens, onChange, balances, prices }: CurrencyPickerProps) {
  const selected = paymentToken(value);
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const option = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    option.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <div className="sale-currency" ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (open && event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); close(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (disabled) return;
        if (!open) { setOpen(true); return; }
        const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    }}>
    <button className="sale-currency-trigger" ref={trigger} type="button" disabled={disabled}
      aria-label={`Currency: ${selected.symbol}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)}>
      <FundingTokenIcon symbol={selected.symbol} />
      <span>{selected.symbol}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div className="sale-currency-menu" id={id} role="menu" aria-label="Currency">
      <p className="sale-currency-menu-heading"><span>Select currency</span><span>Wallet balance</span></p>
      {tokens.map(token => {
        const balance = balances?.[token.address.toLowerCase()];
        const active = selected.address === token.address;
        return <button key={token.symbol} ref={active ? option : undefined} type="button" role="menuitemradio" aria-checked={active}
          onClick={() => { onChange(token.address); close(); }}>
          <FundingTokenIcon symbol={token.symbol}/>
          <span className="sale-currency-identity"><strong>{token.symbol} {active && <Check size={14} aria-hidden="true" />}</strong><small>Ethereum</small></span>
          <span className="sale-currency-balance"><strong>{balance === undefined ? "—" : `${formatTokenBalance(balance,token.address)} ${token.symbol}`}</strong>
            {balance !== undefined && <small>{paymentUsd(balance,token.address,prices)}</small>}</span>
        </button>;
      })}
      <small className="sale-currency-hint">Payment and fees settle in {selected.symbol}.</small>
    </div>}
  </div>;
}
