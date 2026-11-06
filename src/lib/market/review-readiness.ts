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

export function reviewReadiness({ kind, paying, config, live, availability, balance }: Review) {
  if (kind === "cancel") return { checking: false, blocked: false, failure: undefined };
  const queries = [config, live, ...(kind === "fill" ? [availability] : []), ...(paying ? [balance] : [])];
  const checking = queries.some(query => query.isFetching || (query.isPending && !query.isError));
  const marketBlocked = !config.data?.enabled || config.data.recoveryOnly || config.data.newActivityPaused;
  const blocked = checking || queries.some(query => query.isError) || marketBlocked || !live.data?.canList ||
    (kind === "fill" && (!availability.data || !orderAvailable(availability.data)));
  let failure: string | undefined;
  if (!checking) {
    if (config.isError) failure = "Could not check the market. Please try again.";
    else if (live.isError) failure = "Could not verify this stake. Please try again.";
    else if (kind === "fill" && availability.isError) failure = "Could not verify this order. Please try again.";
    else if (paying && balance.isError) failure = "Could not read your WISE balance. Please try again.";
    else if (config.data && marketBlocked) failure = "New trading is paused. You can still cancel existing orders.";
    else if (kind === "fill" && availability.data && !orderAvailable(availability.data)) failure = "This order can no longer be filled. Choose another order.";
    else if (live.data && !live.data.canList) failure = "This stake cannot be traded in its current state.";
  }
  return { checking, blocked, failure };
}
