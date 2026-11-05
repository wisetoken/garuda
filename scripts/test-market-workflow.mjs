import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { refreshTradeData, tradeDestination } from "../src/lib/market/workflow.ts";

test("bid actions return to Purchase bids, while listings return to For sale", () => {
  for (const kind of ["list", "bid"]) {
    const url = new URL(tradeDestination({ kind }, "signature"), "http://localhost");
    assert.equal(url.searchParams.get("view"), "market");
    assert.equal(url.searchParams.get("book"), kind === "bid" ? "bids" : null);
  }
  for (const kind of ["fill", "cancel"]) {
    for (const orderKind of [0, 1]) {
      const url = new URL(tradeDestination({ kind, row: { order: { kind: orderKind } } }, "advanced"), "http://localhost");
      assert.equal(url.searchParams.get("collection"), "advanced");
      assert.equal(url.searchParams.get("book"), orderKind === 1 ? "bids" : null);
    }
  }
});

test("settlement invalidates ownership, open reviews, balances and both order books", async () => {
  const cache = new QueryClient();
  const affected = [
    ["market-book", "signature"], ["market-book", "advanced"],
    ["portfolio", "seller"], ["portfolio", "buyer"],
    ["market-position", "signature", "40"], ["market-review", "signature", "40", "seller"],
    ["market-order-review", "orderHash"], ["wise-balance", "seller"], ["wise-balance", "buyer"],
  ];
  try {
    for (const key of [...affected, ["wise-usd"]]) cache.setQueryData(key, { value: "cached" });
    await refreshTradeData(cache);
    for (const key of affected) assert.equal(cache.getQueryState(key).isInvalidated, true, key.join("/"));
    assert.equal(cache.getQueryState(["wise-usd"]).isInvalidated, false);
  } finally { cache.clear(); }
});
