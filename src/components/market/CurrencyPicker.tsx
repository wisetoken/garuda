import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type CurrencyPickerProps = { disabled?: boolean; balanceLabel: string; balanceUsd?: string };

export function CurrencyPicker({ disabled = false, balanceLabel, balanceUsd }: CurrencyPickerProps) {
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
        event.preventDefault(); if (!disabled) { setOpen(true); option.current?.focus(); }
      }
    }}>
    <button className="sale-currency-trigger" ref={trigger} type="button" disabled={disabled}
      aria-label="Currency: WISE" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)}>
      <img src="/wise-token.svg" width="24" height="24" alt="" />
      <span>WISE</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div className="sale-currency-menu" id={id} role="menu" aria-label="Currency">
      <p className="sale-currency-menu-heading"><span>Select currency</span><span>Wallet balance</span></p>
      <button ref={option} type="button" role="menuitemradio" aria-checked="true" onClick={close}>
        <img src="/wise-token.svg" width="32" height="32" alt="" />
        <span className="sale-currency-identity"><strong>WISE <Check size={14} aria-hidden="true" /></strong><small>Ethereum</small></span>
        <span className="sale-currency-balance"><strong>{balanceLabel}</strong>{balanceUsd && <small>{balanceUsd}</small>}</span>
      </button>
      <small className="sale-currency-hint">Trades settle in WISE.</small>
    </div>}
  </div>;
}
