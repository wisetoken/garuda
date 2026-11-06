import { paymentToken, paymentTokens } from "../../lib/blend/payment-tokens";
import { useEffect, useState } from "react";
import { rangeError, type MarketRangeFilters as Ranges } from "../../lib/market/filter-query";
export function MarketRangeFilters({ filters, onChange }: { filters: Ranges; onChange: (filters: Ranges) => void }) {
  const { currency, minPrice, maxPrice, maturesFrom, maturesTo } = filters;
  const [draft, setDraft] = useState<Ranges>(() => ({ currency, minPrice, maxPrice, maturesFrom, maturesTo }));
  useEffect(() => { setDraft({ currency, minPrice, maxPrice, maturesFrom, maturesTo }); }, [currency, minPrice, maxPrice, maturesFrom, maturesTo]);
  const error = rangeError(draft);
  return <details className="table-filter-ranges">
    <summary>Price & maturity</summary>
    <form onSubmit={event => { event.preventDefault(); if (!error) onChange(draft); }}>
      <div className="table-filter-range-row" role="group" aria-label="Payment currency">
        {[{symbol:"All",address:""},...paymentTokens].map(token => <button type="button" key={token.symbol} aria-pressed={(draft.currency ?? "")===token.address}
          onClick={() => setDraft({...draft,currency:token.address || undefined,minPrice:"",maxPrice:""})}>{token.symbol}</button>)}
      </div>
      <div className="table-filter-range-row">
        <label>Min. price / {paymentToken(draft.currency ?? paymentTokens[0].address).symbol}<input inputMode="decimal" placeholder="Any" value={draft.minPrice ?? ""}
          onChange={event => setDraft({ ...draft, minPrice: event.target.value })} /></label>
        <label>Max. price / {paymentToken(draft.currency ?? paymentTokens[0].address).symbol}<input inputMode="decimal" placeholder="Any" value={draft.maxPrice ?? ""}
          onChange={event => setDraft({ ...draft, maxPrice: event.target.value })} /></label>
      </div>
      <div className="table-filter-range-row table-filter-date-row">
        <label>Matures from / UTC<input type="date" value={draft.maturesFrom ?? ""}
          onChange={event => setDraft({ ...draft, maturesFrom: event.target.value })} /></label>
        <label>Matures to / UTC<input type="date" value={draft.maturesTo ?? ""}
          onChange={event => setDraft({ ...draft, maturesTo: event.target.value })} /></label>
      </div>
      {error && <p role="status">{error}</p>}
      <button type="submit" disabled={!!error}>Apply range</button>
    </form>
  </details>;
}
