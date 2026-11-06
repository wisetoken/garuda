import { useEffect, useState } from "react";
import { rangeError, type MarketRangeFilters as Ranges } from "../../lib/market/filter-query";
export function MarketRangeFilters({ filters, onChange }: { filters: Ranges; onChange: (filters: Ranges) => void }) {
  const { minPrice, maxPrice, maturesFrom, maturesTo } = filters;
  const [draft, setDraft] = useState<Ranges>(() => ({ minPrice, maxPrice, maturesFrom, maturesTo }));
  useEffect(() => { setDraft({ minPrice, maxPrice, maturesFrom, maturesTo }); }, [minPrice, maxPrice, maturesFrom, maturesTo]);
  const error = rangeError(draft);
  return <details className="table-filter-ranges">
    <summary>Price & maturity</summary>
    <form onSubmit={event => { event.preventDefault(); if (!error) onChange(draft); }}>
      <div className="table-filter-range-row">
        <label>Min. price / WISE<input inputMode="decimal" placeholder="Any" value={draft.minPrice ?? ""}
          onChange={event => setDraft({ ...draft, minPrice: event.target.value })} /></label>
        <label>Max. price / WISE<input inputMode="decimal" placeholder="Any" value={draft.maxPrice ?? ""}
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
