import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getAddress } from "viem";
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

export function useBook(id: StakeCollectionId, deployment?: SalesDeployment) {
  return useInfiniteQuery({
    queryKey: ["market-book", id, deployment?.adapter],
    enabled: !!deployment,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const path = pageParam ? `?before=${encodeURIComponent(pageParam)}` : "";
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
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
export function useOrderPosition(row: SaleRow) {
  const id = stakeCollection(row.order.collection).id;
  return useQuery({
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
              }),
            )
          : undefined;
      } catch {
        return undefined;
      }
    },
    staleTime: 30_000,
    retry: 1,
  });
}
