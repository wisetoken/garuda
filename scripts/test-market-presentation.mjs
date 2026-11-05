import test from "node:test";
import assert from "node:assert/strict";
import { parseEther } from "viem";
import {
  filterEntries,
  sortEntries,
  emptyFilters,
  marketWise,
  marketUsd,
  statusLabel,
  daysServed,
} from "../src/lib/market/presentation.ts";
import { STAKE_COLLECTIONS } from "../src/lib/blend/stake-collections.ts";

const entry = (id, collection, amount, position) => ({
  row: {
    hash: id,
    order: {
      tokenId: String(id),
      collection: STAKE_COLLECTIONS[collection].address,
      owner: "0xABC123",
      maker: "0xDEF456",
      amount: String(amount),
      deadline: "1800000000",
    },
  },
  position,
});
const position = (overrides = {}) => ({
  startAt: 100 * 86400,
  maturesAt: 200 * 86400,
  observedAt: 120 * 86400,
  principal: parseEther("1000"),
  unclaimedInterest: parseEther("10"),
  rewardDays: 5,
  status: "Active",
  ...overrides,
});

test("price sorting keeps wei precision and does not mutate source entries", () => {
  const a = entry(1, "signature", 9007199254740993n),
    b = entry(2, "signature", 9007199254740992n);
  const original = [a, b];
  assert.deepEqual(sortEntries(original, "price", "asc"), [b, a]);
  assert.deepEqual(sortEntries(original, "price", "desc"), [a, b]);
  assert.deepEqual(original, [a, b]);
});
test("unknown position values sort last in either direction", () => {
  const unknown = entry(1, "signature", 1n),
    low = entry(2, "signature", 1n, position()),
    high = entry(
      3,
      "advanced",
      1n,
      position({ principal: parseEther("2000") }),
    );
  assert.deepEqual(sortEntries([unknown, low, high], "amount", "asc"), [
    low,
    high,
    unknown,
  ]);
  assert.deepEqual(sortEntries([unknown, low, high], "amount", "desc"), [
    high,
    low,
    unknown,
  ]);
});
test("collection and status filters combine while same-group options are inclusive", () => {
  const active = entry(52, "signature", 1n, position()),
    mature = entry(22, "advanced", 1n, position({ observedAt: 200 * 86400 }));
  const unknown = entry(53, "signature", 1n);
  assert.deepEqual(
    filterEntries([active, mature, unknown], {
      ...emptyFilters,
      statuses: ["Active", "Mature"],
    }),
    [active, mature],
  );
  assert.deepEqual(
    filterEntries([active, mature], {
      ...emptyFilters,
      collections: ["signature"],
      statuses: ["Mature"],
    }),
    [],
  );
  assert.deepEqual(
    filterEntries([active, mature], {
      ...emptyFilters,
      search: " SIGNATURE #52 ",
    }),
    [active],
  );
  assert.deepEqual(
    filterEntries([active], { ...emptyFilters, search: "0xdef" }),
    [active],
  );
});
test("maturity status follows the observed timeline and days served include scraped days", () => {
  assert.equal(statusLabel(position()), "80 Days Left");
  assert.equal(daysServed(position()), "20 Days served");
  assert.equal(statusLabel(position({ observedAt: 200 * 86400 })), "Matured");
  assert.equal(
    daysServed(position({ observedAt: 300 * 86400 })),
    "100 Days served",
  );
  assert.equal(
    daysServed(position({ observedAt: 90 * 86400 })),
    "0 Days served",
  );
});
test("table formatting preserves small rewards and unavailable valuations", () => {
  assert.equal(marketWise(parseEther("0.005831")), "0.005831");
  assert.equal(marketWise(parseEther("1248.813456")), "1,248.81");
  assert.equal(marketWise(parseEther("10"), true), "10.00");
  assert.equal(marketWise(parseEther("32000"), true), "32,000");
  assert.equal(marketUsd(parseEther("0.005831"), 0.12), "<0.01 USD");
  assert.equal(marketUsd(parseEther("10")), "—");
  assert.equal(marketUsd(parseEther("10"), 0.12), "1.20 USD");
});
