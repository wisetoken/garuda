import test from "node:test";
import assert from "node:assert/strict";
import { parseEther } from "viem";
import { emptyStakeFilters, filterStakes, sortStakes, stakeCreatedAt, stakeName } from "../src/lib/stakes/table.ts";
import { STAKE_COLLECTIONS } from "../src/lib/blend/stake-collections.ts";

const day = 86400;
const stake = (tokenId, overrides = {}) => ({
  tokenId, owner: "0xABC123", collection: STAKE_COLLECTIONS.signature.address,
  startAt: 100 * day, maturesAt: 200 * day, observedAt: 120 * day,
  principal: parseEther("1000"), unclaimedInterest: parseEther("10"),
  rewardDays: 5, status: "Active", ...overrides,
});

test("newest-first sorting uses creation time, falls back to start, and preserves source order", () => {
  const older = stake("53", { displayStake: { createdAtTimestamp: String(90 * day) } });
  const newer = stake("20", { displayStake: { createdAtTimestamp: String(95 * day) } });
  const fallback = stake("22", { displayStake: { createdAtTimestamp: "invalid" } });
  const original = [older, newer, fallback];
  assert.deepEqual(sortStakes(original, "created", "desc"), [fallback, newer, older]);
  assert.deepEqual(sortStakes(original, "created", "asc"), [older, newer, fallback]);
  assert.deepEqual(original, [older, newer, fallback]);
  assert.equal(stakeCreatedAt(stake("1")), 100 * day);
});

test("principal and reward sorting retain wei precision; missing values always sort last", () => {
  const low = stake("1", { principal: 9007199254740992n, unclaimedInterest: 9007199254740992n });
  const high = stake("2", { principal: 9007199254740993n, unclaimedInterest: 9007199254740993n });
  const unknown = stake("3", { unclaimedInterest: undefined });
  assert.deepEqual(sortStakes([high, low], "amount", "asc"), [low, high]);
  assert.deepEqual(sortStakes([unknown, high, low], "reward", "asc"), [low, high, unknown]);
  assert.deepEqual(sortStakes([unknown, low, high], "reward", "desc"), [high, low, unknown]);
  for (const direction of ["asc", "desc"]) {
    assert.equal(sortStakes([unknown, low, high], "apy", direction).at(-1), unknown);
  }
});

test("collection, timeline status and search filters combine without hiding valid matches", () => {
  const active = stake("53"), mature = stake("20", { observedAt: 200 * day });
  const advanced = stake("22", { collection: STAKE_COLLECTIONS.advanced.address });
  const positions = [active, mature, advanced];
  assert.deepEqual(filterStakes(positions, { ...emptyStakeFilters, collections: ["signature"], statuses: ["Mature"] }), [mature]);
  assert.deepEqual(filterStakes(positions, { ...emptyStakeFilters, statuses: ["Active", "Mature"] }), positions);
  for (const search of [" SIGNATURE STAKE #53 ", "signature #53", "#53"]) {
    assert.deepEqual(filterStakes(positions, { ...emptyStakeFilters, search }), [active]);
  }
  assert.deepEqual(filterStakes(positions, { ...emptyStakeFilters, search: "0xabc" }), positions);
  assert.deepEqual(filterStakes(positions, { ...emptyStakeFilters, collections: ["advanced"], statuses: ["Mature"] }), []);
  assert.equal(stakeName(advanced), "Advanced Stake #22");
});
