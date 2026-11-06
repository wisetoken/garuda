import { screenHref } from "../../navigation";
import { paymentToken } from "../blend/payment-tokens";
import type { QueryClient } from "@tanstack/react-query";
import type { MarketIntent } from "./types";

export function tradeInstructions(intent: MarketIntent) {
  if (intent.kind === "list")
    return "Approve this NFT if needed, then sign the listing. Signing does not transfer ownership. Ethereum gas is separate.";
  if (intent.kind === "bid") return "";
  if (intent.kind === "cancel")
    return "Cancellation requires an Ethereum transaction. Closing this dialog does not cancel an order.";
  return intent.row.order.kind === 0
    ? `Approve ${paymentToken(intent.row.order.currency).symbol} if needed, then confirm the purchase. Payment and full NFT ownership transfer together. Ethereum gas is separate.`
    : `Approve this NFT if needed, then accept the bid. You receive ${paymentToken(intent.row.order.currency).symbol} after the marketplace fee, and the bidder receives full NFT ownership in the same transaction. Ethereum gas is separate.`;
}

export function tradeDestination(intent: MarketIntent, collection: string) {
  const filters: Record<string, string> = { collection };
  if (intent.kind === "bid" || ("row" in intent && intent.row.order.kind === 1))
    filters.book = "bids";
  return screenHref("trade", filters);
}

export function refreshTradeData(cache: QueryClient) {
  // Refresh both sides of a transfer, including any already-open order review.
  return Promise.all([
    "market-book", "market-availability", "portfolio", "market-position", "market-review",
    "market-order-review", "wise-balance",
  ].map((key) => cache.invalidateQueries({ queryKey: [key] })));
}
