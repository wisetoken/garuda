import type { QueryClient } from "@tanstack/react-query";
import type { MarketIntent } from "./types";

export function tradeInstructions(intent: MarketIntent) {
  if (intent.kind === "list")
    return "Approve this NFT if needed, then sign the listing. Signing does not transfer ownership. Ethereum gas is separate.";
  if (intent.kind === "bid")
    return "Approve the exact WISE amount, then sign your bid. Funds are not escrowed. The owner may accept until expiry or onchain cancellation.";
  if (intent.kind === "cancel")
    return "Cancellation requires an Ethereum transaction. Closing this dialog does not cancel an order.";
  return intent.row.order.kind === 0
    ? "Approve WISE if needed, then confirm the purchase. Payment and full NFT ownership transfer together. Ethereum gas is separate."
    : "Approve this NFT if needed, then accept the bid. You receive WISE after the marketplace fee, and the bidder receives full NFT ownership in the same transaction. Ethereum gas is separate.";
}

export function tradeDestination(intent: MarketIntent, collection: string) {
  const params = new URLSearchParams({ screen: "trade", collection, view: "market" });
  if (intent.kind === "bid" || ("row" in intent && intent.row.order.kind === 1))
    params.set("book", "bids");
  return `/garuda/?${params}`;
}

export function refreshTradeData(cache: QueryClient) {
  // Refresh both sides of a transfer, including any already-open order review.
  return Promise.all([
    "market-book", "market-availability", "portfolio", "market-position", "market-review",
    "market-order-review", "wise-balance",
  ].map((key) => cache.invalidateQueries({ queryKey: [key] })));
}
