import type { SaleRow, SalesConfig } from "../blend/sales";
import { orderAvailable } from "./api";

type QueryState<T> = { data?: T; isPending: boolean; isFetching: boolean; isError: boolean };
type Review = {
  kind: "list" | "bid" | "fill" | "cancel";
  paying: boolean;
  config: QueryState<SalesConfig>;
  live: QueryState<{ canList: boolean }>;
  availability: QueryState<SaleRow>;
  balance: QueryState<bigint>;
};

export function reviewReadiness({ kind, config, live, availability }: Review) {
  if (kind === "cancel") return { checking: false, blocked: false, failure: undefined };
  // Background balance, stake-detail and availability refreshes must not hold
  // the wallet button hostage. Current execution is enforced by the contracts.
  const checking = !config.data && !config.isError || !!(config.data?.enabled && config.data.recoveryOnly && config.isFetching);
  const marketBlocked = !config.data?.enabled || config.data.recoveryOnly || config.data.newActivityPaused;
  const unavailable = kind === "fill" && availability.data && !orderAvailable(availability.data);
  const invalidStake = live.data && !live.data.canList;
  const blocked = checking || marketBlocked || !!unavailable || !!invalidStake;
  let failure: string | undefined;
  if (!checking) {
    if (config.isError && (!config.data || (config.data.enabled && config.data.recoveryOnly))) failure = "Could not check the market. Please try again.";
    else if (config.data && marketBlocked) failure = "New trading is paused. You can still cancel existing orders.";
    else if (unavailable) failure = "This order can no longer be filled. Choose another order.";
    else if (invalidStake) failure = "This stake cannot be traded in its current state.";
  }
  return { checking, blocked, failure };
}
