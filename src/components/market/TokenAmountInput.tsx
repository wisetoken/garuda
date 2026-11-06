import { useLayoutEffect, useRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { formatTokenInput, readTokenInput, tokenInputCaret } from '../../lib/market/amount-input';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function TokenAmountInput({ value, onValueChange, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const display = formatTokenInput(value);
  useLayoutEffect(() => {
    if (caret.current !== null) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });
  return <input {...props} ref={input} value={display} inputMode="decimal" autoComplete="off"
    onKeyDown={event => {
      const el = event.currentTarget;
      const start = el.selectionStart ?? 0;
      if (el.selectionEnd !== start) return;
      // Skip grouping separators when deleting so the caret never gets stuck.
      if (event.key === 'Backspace' && display[start - 1] === ',') el.setSelectionRange(start - 1, start - 1);
      if (event.key === 'Delete' && display[start] === ',') el.setSelectionRange(start + 1, start + 1);
    }}
    onChange={event => {
      const el = event.currentTarget;
      const raw = readTokenInput(el.value);
      if (raw === undefined) return;
      const before = readTokenInput(el.value.slice(0, el.selectionStart ?? el.value.length)) ?? '';
      caret.current = tokenInputCaret(formatTokenInput(raw), before.length);
      onValueChange(raw);
    }} />;
}
