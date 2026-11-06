import { infiniteQueryOptions } from "@tanstack/react-query";
import { marketApi, parseBook, type MarketBook } from "./api";
import type { MarketQueryFilters } from "./filter-query";
import type { SalesDeployment } from "../blend/sales";
import type { StakeCollectionId } from "../blend/stake-collections";

export function bookOptions(id: StakeCollectionId, deployment?: SalesDeployment, source: "arkiv" | "catalog" = "catalog", kind?: "listing" | "bid", sort?: "publishedAt" | "price" | "principal" | "shares" | "expires" | "stakeStartAt", direction: "asc" | "desc" = "asc", filters: MarketQueryFilters = {}, useCache = true) {
  return infiniteQueryOptions({
    queryKey: ["market-book", id, deployment?.adapter, source, source === "arkiv" ? kind : null, sort, direction, source === "arkiv" ? filters : null, "checked"],
    enabled: !!deployment,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams();
      if (source === "arkiv") {
        query.set("source", "arkiv");
        for (const [key, value] of Object.entries(filters)) if (value !== undefined) query.set(key, value);
        if (kind) query.set("kind", kind);
        if (sort) { query.set("sort", sort); query.set("direction", direction); }
      }
      if (pageParam) query.set("before", pageParam);
      // Publish a checked page together, never provisional rows that disappear
      // as individual availability requests finish. On failure React Query keeps
      // the last successful page instead of replacing it with an unchecked catalog.
      const book = parseBook(await marketApi<MarketBook>(id, `sales${query.size ? `?${query}` : ""}`), deployment!);
      if (book.orders.some(row => row.status === "checking")) throw new Error("Order availability is still being checked. Please retry.");
      return { ...book, checkedAt: Math.floor(Date.now() / 1000) };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: useCache ? Infinity : 0,
    gcTime: useCache ? 5 * 60_000 : 0,
    retry: (failures, error) => !/rate limit|busy/i.test(error.message) && failures < 1,
    // The refresh control and completed trades update the book. Focus, timers
    // and reconnects must not remove rows underneath a buyer.
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
