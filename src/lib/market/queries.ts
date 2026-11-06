import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { getAddress } from "viem";
import type { MarketQueryFilters } from "./filter-query";
import { marketApi, parseBook, type MarketBook } from "./api";
import type { SalesDeployment, SaleRow } from "../blend/sales";
import { loadSignaturePortfolio } from "../blend/live-portfolio";
import {
  stakeCollection,
  type StakeCollectionId,
} from "../blend/stake-collections";
import {
  parseStakeSnapshot,
  positionFromSnapshot,
  type StakeDetails,
} from "../blend/stake-snapshot";
import { ethereumClient } from "../portfolio";

export function useBook(id: StakeCollectionId, deployment?: SalesDeployment, source: "arkiv" | "catalog" = "catalog", kind?: "listing" | "bid", sort?: "price" | "principal" | "shares" | "expires" | "stakeStartAt", direction: "asc" | "desc" = "asc", filters: MarketQueryFilters = {}, useCache = true) {
  return useInfiniteQuery({
    queryKey: ["market-book", id, deployment?.adapter, source, source === "arkiv" ? kind : null, sort, direction, source === "arkiv" ? filters : null, useCache],
    enabled: !!deployment,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const path = pageParam ? `?before=${encodeURIComponent(pageParam)}` : "";
      if (source === "arkiv") {
        const query = new URLSearchParams({source:"arkiv",preview:"1"});
        for (const [key, value] of Object.entries(filters)) if (value !== undefined) query.set(key, value);
        if (pageParam) query.set("before",pageParam);
        if (kind) query.set("kind",kind);
        if (sort) { query.set("sort",sort); query.set("direction",direction); }
        return {...parseBook(await marketApi<MarketBook>(id, `sales?${query}`), deployment!),verified:false};
      }
      try {
        return {
          ...parseBook(
            await marketApi<MarketBook>(id, "sales" + path),
            deployment!,
          ),
          verified: true,
        };
      } catch {
        const book = parseBook(
          await marketApi<MarketBook>(id, "catalog" + path),
          deployment!,
        );
        return {
          ...book,
          orders: book.orders.map((row) => ({
            ...row,
            status: "checking" as const,
          })),
          verified: false,
        };
      }
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: useCache ? 15_000 : 0,
    gcTime: useCache ? 5 * 60_000 : 0,
    retry: (failures, error) => !/rate limit|busy/i.test(error.message) && failures < 1,
    refetchInterval: query => query.state.status === "error" ? false : 30_000,
  });
}
function orderPositionQuery(row: SaleRow) {
  const id = stakeCollection(row.order.collection).id;
  return {
    queryKey: [
      "market-position",
      row.order.collection,
      row.order.tokenId,
      row.order.owner,
    ],
    queryFn: async () => {
      try {
        const data = await marketApi<StakeDetails>(
          id,
          `stake-details/${row.hash}`,
        );
        return positionFromSnapshot(
          parseStakeSnapshot(data.snapshot, {
            collection: row.order.collection,
            owner: row.order.owner,
            tokenId: row.order.tokenId,
            stakeId: row.order.stakeId,
          }),
        );
      } catch {
        const portfolio = await loadSignaturePortfolio(
          ethereumClient,
          row.order.owner,
          1,
          getAddress(row.order.collection),
          [row.order.tokenId],
        );
        if (!portfolio.positions[0])
          throw new Error("Stake details unavailable");
        return portfolio.positions[0];
      }
    },
    initialData: () => {
      try {
        return row.stakeSnapshot
          ? positionFromSnapshot(
              parseStakeSnapshot(row.stakeSnapshot, {
                collection: row.order.collection,
                owner: row.order.owner,
                tokenId: row.order.tokenId,
                stakeId: row.order.stakeId,
              }, undefined, 86400),
            )
          : undefined;
      } catch {
        return undefined;
      }
    },
    initialDataUpdatedAt: row.stakeSnapshot ? row.stakeSnapshot.observedAt * 1000 : undefined,
    staleTime: 30_000,
    retry: 1,
  };
}

export function useOrderPosition(row: SaleRow) {
  return useQuery(orderPositionQuery(row));
}

export function useOrderPositions(rows: SaleRow[]) {
  const key = (row: SaleRow) =>
    `${row.order.collection}:${row.order.tokenId}:${row.order.owner}`;
  const unique = [...new Map(rows.map((row) => [key(row), row])).values()];
  const queries = useQueries({ queries: unique.map(orderPositionQuery) });
  const byPosition = new Map(
    unique.map((row, index) => [key(row), queries[index]]),
  );
  return rows.map((row) => byPosition.get(key(row))!);
}

/** Indexed rows render first; settlement availability is independently verified. */
export function useOrderAvailability(rows: SaleRow[]) {
  return useQueries({queries: rows.map(row => ({
    queryKey:["market-availability",row.order.collection,row.hash],
    enabled:row.status === "checking",
    queryFn:async()=> {
      const verified = await marketApi<SaleRow>(stakeCollection(row.order.collection).id,`sales/${row.hash}`);
      if (verified.hash.toLowerCase() !== row.hash.toLowerCase()) throw new Error("Order identity mismatch.");
      return verified.status;
    },
    staleTime:15_000,refetchInterval:30_000,retry:1,
  }))});
}
