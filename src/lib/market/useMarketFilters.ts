import { useEffect, useState } from "react";
import { arkivQueryFilters } from "./filter-query";
import type { MarketFilters } from "./presentation";
export function useMarketFilters(filters: MarketFilters) {
  const [search, setSearch] = useState(filters.search);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(filters.search), 350);
    return () => clearTimeout(timer);
  }, [filters.search]);
  return { query: arkivQueryFilters({ ...filters, search }), pending: search !== filters.search };
}
