import type { SaleRow, SalesConfig } from "../blend/sales";
import { orderAvailable } from "./api";

type QueryState<T> = { data?: T; isPending: boolean; isFetching: boolean; isError: boolean };
type Review = {
  kind: "list" | "bid" | "fill" | "cancel";
  paying: boolean;
  hasPosition?: boolean;
  config: QueryState<SalesConfig>;
  live: QueryState<{ canList: boolean }>;
  availability: QueryState<SaleRow>;
  balance: QueryState<bigint>;
};

export function reviewReadiness({ kind, config, live, availability, hasPosition = !!live.data }: Review) {
  if (kind === "cancel") return { checking: false, blocked: false, failure: undefined };
  // Opening a review never waits for a read. Its submit action waits for the
  // first availability result; background refreshes retain the ready state.
  const missingPosition = kind === "fill" && !hasPosition;
  const missingOrderCheck = kind === "fill" && !availability.data;
  const checking = !config.data && !config.isError || !!(config.data?.enabled && config.data.recoveryOnly && config.isFetching) ||
    (missingOrderCheck && availability.isFetching) || (missingPosition && live.isFetching);
  const marketBlocked = !config.data?.enabled || config.data.recoveryOnly || config.data.newActivityPaused;
  const unavailable = kind === "fill" && availability.data && !orderAvailable(availability.data);
  const invalidStake = live.data && !live.data.canList;
  const blocked = checking || missingOrderCheck || missingPosition || marketBlocked || !!unavailable || !!invalidStake;
  let failure: string | undefined;
  if (!checking) {
    if (config.isError && (!config.data || (config.data.enabled && config.data.recoveryOnly))) failure = "Could not check the market. Please try again.";
    else if (config.data && marketBlocked) failure = "New trading is paused. You can still cancel existing orders.";
    else if (missingOrderCheck) failure = "Could not check this order. Please try again.";
    else if (missingPosition) failure = "Could not load this stake. Please try again.";
    else if (unavailable) failure = "This order can no longer be filled. Choose another order.";
    else if (invalidStake) failure = "This stake cannot be traded in its current state.";
  }
  return { checking, blocked, failure };
}
