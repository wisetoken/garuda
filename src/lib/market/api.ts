import { useQueries } from "@tanstack/react-query";
import {
  STAKE_COLLECTIONS,
  type StakeCollectionId,
} from "../blend/stake-collections";
import {
  parseSalesDeployment,
  parseSignedSale,
  sameAddress,
  type SalesConfig,
  type SalesDeployment,
  type SaleRow,
} from "../blend/sales";
export const collectionIds: StakeCollectionId[] = ["signature", "advanced"];
export async function marketApi<T>(
  id: StakeCollectionId,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `/api/garuda/${id === "advanced" ? "advanced/" : ""}${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "The market service is unavailable. Please try again.",
    );
  return data;
}
const configKey = (id: StakeCollectionId) => `garuda:market-config:${id}:v1`;
export function validateConfig(
  raw: SalesConfig,
  id: StakeCollectionId,
): SalesConfig {
  if (!raw.enabled) return raw;
  const deployment = parseSalesDeployment(raw.deployment);
  if (
    deployment.environment !== "ethereum-mainnet" ||
    !sameAddress(deployment.collection, STAKE_COLLECTIONS[id].address)
  )
    throw new Error("Unexpected Ethereum market configuration.");
  return { ...raw, deployment };
}
export function useMarkets() {
  return useQueries({
    queries: collectionIds.map((id) => ({
      queryKey: ["market-config", id],
      queryFn: async () => {
        const config = validateConfig(
          await marketApi<SalesConfig>(id, "config"),
          id,
        );
        if (config.enabled)
          try {
            localStorage.setItem(configKey(id), JSON.stringify(config));
          } catch {
            /* Live reads still work. */
          }
        return config;
      },
      initialData: () => {
        try {
          const raw = JSON.parse(localStorage.getItem(configKey(id)) ?? "null");
          return raw?.enabled
            ? ({
                ...validateConfig(raw, id),
                recoveryOnly: true,
              } as SalesConfig)
            : undefined;
        } catch {
          return undefined;
        }
      },
      staleTime: 0,
      refetchInterval: 30_000,
      retry: 1,
    })),
  });
}
export type MarketActivityEvent = {
  block_number: string;
  tx_hash: string;
  event_name: string;
  payload?: Record<string, string>;
};
export type MarketBook = {
  orders: SaleRow[];
  nextCursor: string | null;
  activity?: MarketActivityEvent[];
};
export function parseBook(
  raw: MarketBook,
  deployment: SalesDeployment,
): MarketBook {
  if (!Array.isArray(raw.orders)) throw new Error("Invalid order book.");
  return {
    ...raw,
    activity: Array.isArray(raw.activity)
      ? raw.activity.filter(
          (event) =>
            event &&
            /^0x[a-fA-F0-9]{64}$/.test(event.tx_hash) &&
            /^\d+$/.test(event.block_number) &&
            typeof event.event_name === "string",
        )
      : [],
    orders: raw.orders.map((row) => {
      const parsed = parseSignedSale(row, deployment);
      if (parsed.hash.toLowerCase() !== row.hash.toLowerCase())
        throw new Error("Order identity mismatch.");
      return { ...row, ...parsed.signed };
    }),
  };
}
export function orderAvailable(
  row: SaleRow,
  now = Math.floor(Date.now() / 1000),
) {
  return (
    row.status === "available" &&
    BigInt(row.order.startTime) <= BigInt(now) &&
    BigInt(row.order.deadline) > BigInt(now)
  );
}
