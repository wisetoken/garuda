import test from "node:test";
import assert from "node:assert/strict";
import { reviewReadiness } from "../src/lib/market/review-readiness.ts";

const ready = data => ({ data, isPending: false, isFetching: false, isError: false });
const pending = () => ({ isPending: true, isFetching: true, isError: false });
const failed = data => ({ data, isPending: false, isFetching: false, isError: true });
const review = overrides => ({
  kind: "list", paying: false,
  config: ready({ enabled: true }), live: ready({ canList: true }),
  availability: ready({ status: "available", order: { startTime: "0", deadline: "9999999999" } }),
  balance: ready(100n), ...overrides,
});

test("cached recovery settings disable submission without an outage message while being checked", () => {
  const result = reviewReadiness(review({ config: { ...ready({ enabled: true, recoveryOnly: true }), isFetching: true } }));
  assert.equal(result.blocked, true);
  assert.equal(result.checking, true);
  assert.equal(result.failure, undefined);
});

test("initial display and balance reads do not delay the wallet action", () => {
  for (const overrides of [{ live: pending() }, { kind: "bid", paying: true, balance: pending() }, { kind: "fill", availability: pending() }]) {
    const result = reviewReadiness(review(overrides));
    assert.equal(result.blocked, false);
    assert.equal(result.checking, false);
    assert.equal(result.failure, undefined);
  }
});

test("failed background reads do not disable a previously loaded market", () => {
  for (const overrides of [{live:failed({canList:true})},{kind:'fill',availability:failed()},{kind:'bid',paying:true,balance:failed()}]) {
    assert.deepEqual(reviewReadiness(review(overrides)),{checking:false,blocked:false,failure:undefined});
  }
  const noConfig=reviewReadiness(review({config:failed()}));
  assert.equal(noConfig.blocked,true);assert.match(noConfig.failure,/Could not/);
});
test("background refreshes keep an available action ready", () => {
  assert.deepEqual(reviewReadiness(review({live:{...ready({canList:true}),isFetching:true},config:{...ready({enabled:true}),isFetching:true}})),{checking:false,blocked:false,failure:undefined});
});

test("paused markets, invalid stake state and expired orders still cannot be submitted", () => {
  for (const overrides of [{ config: ready({ enabled: true, newActivityPaused: true }) }, { live: ready({ canList: false }) }, { kind: "fill", availability: ready({ status: "available", order: { startTime: "0", deadline: "1" } }) }]) {
    const result = reviewReadiness(review(overrides));
    assert.equal(result.blocked, true);
    assert.ok(result.failure);
  }
});

test("cancellation remains possible during an outage without waiting for irrelevant reads", () => {
  assert.deepEqual(reviewReadiness(review({ kind: "cancel", config: failed(), live: pending(), availability: failed(), balance: failed() })), { checking: false, blocked: false, failure: undefined });
});

test("disabled balance and order queries do not block a listing", () => {
  assert.deepEqual(reviewReadiness(review({ balance: pending(), availability: pending() })), { checking: false, blocked: false, failure: undefined });
});


test("a seller's wallet balance never gates listing an NFT stake", () => {
  for (const balance of [ready(0n), pending(), failed()]) {
    assert.deepEqual(reviewReadiness(review({ balance })), { checking: false, blocked: false, failure: undefined });
  }
});
