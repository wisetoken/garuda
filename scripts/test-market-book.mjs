import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { QueryClient, InfiniteQueryObserver, focusManager, onlineManager } from "@tanstack/react-query";
import { bookOptions } from "../src/lib/market/book-query.ts";
import { parseSignedSale, serializeSale } from "../src/lib/blend/sales.ts";
import { orderAvailable } from "../src/lib/market/api.ts";

const deployment = JSON.parse(await readFile(new URL("./fixtures/signature-market.json", import.meta.url)));
function row(tokenId, status = "available") {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const signed = { signature: "0x1234", order: serializeSale({
    kind: 0, maker: `0x${"1".repeat(40)}`, owner: `0x${"1".repeat(40)}`,
    collection: deployment.collection, currency: deployment.currency, tokenId: BigInt(tokenId),
    stakeId: `0x${"55".repeat(16)}`, stateHash: `0x${"66".repeat(32)}`,
    amount: 1000n, nonce: 1n, epoch: 0n, counter: 0n, startTime: now - 60n,
    deadline: now + 3600n, feeBps: deployment.feeBps, feeRecipient: deployment.feeRecipient,
  }) };
  return { ...signed, hash: parseSignedSale(signed, deployment).hash, status, publishedBlock: "1", publishedBlockHash: `0x${"77".repeat(32)}` };
}
const options = (source = "arkiv", cache = true) => ({
  ...bookOptions("signature", deployment, source, "listing", "price", "asc", {}, cache), retry: false,
});
const response = orders => Response.json({ orders, nextCursor: null });
const turn = () => new Promise(resolve => setImmediate(resolve));

test("Arkiv publishes one checked page without showing sold or provisional offers first", async t => {
  const client = new QueryClient();
  t.after(() => client.clear());
  let finish, requested;
  t.mock.method(globalThis, "fetch", async url => {
    requested = new URL(url, "http://localhost");
    return new Promise(resolve => { finish = resolve; });
  });
  const config = options();
  const pending = client.fetchInfiniteQuery(config);
  await turn();
  assert.equal(requested.searchParams.get("source"), "arkiv");
  assert.equal(requested.searchParams.has("preview"), false);
  assert.equal(client.getQueryData(config.queryKey), undefined);
  finish(response([row(1, "sold"), row(2), row(3, "transferred")]));
  const result = await pending;
  assert.deepEqual(result.pages[0].orders.filter(r => orderAvailable(r, result.pages[0].checkedAt)).map(r => r.order.tokenId), ["2"]);
});

for (const source of ["arkiv", "catalog"]) test(`${source}: refresh and outage retain the last checked results`, async t => {
  const client = new QueryClient();
  t.after(() => client.clear());
  const calls = [];
  let fail = false, finish;
  t.mock.method(globalThis, "fetch", async url => {
    calls.push(url);
    if (fail) return Response.json({ error: "Service unavailable" }, { status: 503 });
    if (calls.length > 1) return new Promise(resolve => { finish = resolve; });
    return response([row(1)]);
  });
  const config = options(source);
  const first = await client.fetchInfiniteQuery(config);
  const refresh = client.fetchInfiniteQuery({ ...config, staleTime: 0 });
  await turn();
  assert.deepEqual(client.getQueryData(config.queryKey), first);
  finish(response([row(2)]));
  const refreshed = await refresh;
  assert.equal(refreshed.pages[0].orders[0].order.tokenId, "2");
  fail = true;
  await assert.rejects(client.fetchInfiniteQuery({ ...config, staleTime: 0 }), /Service unavailable/);
  assert.deepEqual(client.getQueryData(config.queryKey), refreshed);
  assert.equal(calls.length, 3, "No unchecked catalog fallback");
});

test("provisional responses are not accepted as a final market page", async t => {
  t.mock.method(globalThis, "fetch", async () => response([row(1, "checking")]));
  const client = new QueryClient();
  t.after(() => client.clear());
  await assert.rejects(client.fetchInfiniteQuery(options()), /still being checked/);
});

test("focus and reconnect leave visible rows steady; explicit refresh still updates them", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return response([row(calls)]); });
  const client = new QueryClient();
  client.mount();
  const observer = new InfiniteQueryObserver(client, options("arkiv", false));
  const unsubscribe = observer.subscribe(() => {});
  t.after(() => { unsubscribe(); client.unmount(); client.clear(); focusManager.setFocused(undefined); onlineManager.setOnline(true); });
  await observer.refetch();
  const before = calls;
  focusManager.setFocused(false); focusManager.setFocused(true);
  onlineManager.setOnline(false); onlineManager.setOnline(true);
  await turn();
  assert.equal(calls, before);
  assert.equal(observer.options.refetchInterval, false);
  await observer.refetch();
  assert.equal(calls, before + 1);
});

test("cache switch determines whether revisiting reuses results", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return response([row(1)]); });
  const client = new QueryClient();
  t.after(() => client.clear());
  await client.fetchInfiniteQuery(options());
  await client.fetchInfiniteQuery(options());
  assert.equal(calls, 1);
  await client.fetchInfiniteQuery(options("arkiv", false));
  assert.equal(calls, 2);
});
