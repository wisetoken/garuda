import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { getAddress } from "viem";
import { bookOptions } from "./book-query";
import { marketApi } from "./api";
import type { SaleRow } from "../blend/sales";
import { loadSignaturePortfolio } from "../blend/live-portfolio";
import { stakeCollection } from "../blend/stake-collections";
import {
  parseStakeSnapshot,
  positionFromSnapshot,
  type StakeDetails,
} from "../blend/stake-snapshot";
import { ethereumClient } from "../portfolio";

export function useBook(...args: Parameters<typeof bookOptions>) {
  return useInfiniteQuery(bookOptions(...args));
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
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
