# Arkiv integration feedback

Environment: `@arkiv-network/sdk` 1.0.1, Rabdi chain 7794095, Node.js 22+, verified 6 November 2026 (India time).

## Saved orders and confirmed Arkiv publication need distinct feedback

Observed on 6 November 2026 while listing Signature Stake #40 for **42,000 WISE**. The user's screenshots showed a saved listing with “Arkiv status is temporarily unavailable” at 08:39 India time, “Publishing to Arkiv…” at 08:40, and “Published on Arkiv” with entity and transaction links at 08:48.

**Expected:** after signing and saving an order, the modal should distinguish pending publication, a failed status check and confirmed publication, and eventually expose a verifiable receipt without another signature.

**What happened:** the listing was saved, but the first status display did not establish whether Arkiv had accepted it. During diagnosis, the running local API had not picked up the new `GET /api/garuda/arkiv/status/:hash` route and returned HTTP 404. Restarting that API made the route available. The modal subsequently showed the published receipt. A direct SDK read confirmed the entity's order hash and a successful transaction in Rabdi block **274557**; see [the receipt and reproduction query](evidence.md#success-modal-publication-check).

**Attribution:** the stale API process was our integration issue. These observations do not establish an Arkiv write failure, HTTP 429, or an SDK defect. We did not capture a trace of enqueue, broadcast, confirmation and index visibility times, so the screenshot interval is not an Arkiv latency measurement.

**What worked:** the saved order and background publication survived the UI status problem. The confirmed record could be read through the SDK, and the modal's polling recovered and exposed the original entity and transaction links. Verifying this result required no additional signature or new publication.

**Reproduce the status-display failure locally:**

1. Keep an API process from before the status route was added running, then serve the frontend containing the success modal. Backend commit `b3be749` and frontend commit `474c69e` reproduce that version mismatch.
2. Request `/api/garuda/arkiv/status/0x72662714f70b11c5871993e5ef358159d96c3326184b097642c5d6a983de21a9` against the old API. It returns 404 regardless of the order's actual Arkiv publication state. An open success modal reports that status is unavailable.
3. Restart with the matching API version and the same database. For this saved listing, the endpoint returns `published` with the receipt below, and the modal updates on its next poll. No new signed order is needed.

**Improvement request for Arkiv developer materials:** a complete asynchronous publication example would help teams expose these stages clearly: application save/queue, transaction submission, confirmation, entity read-back and query visibility. Include stable identifiers, timestamped diagnostics, suggested polling/backoff and recovery after a lost response. Garuda now supplies its own durable queue and status endpoint; documenting the Arkiv-facing stages together would reduce integration guesswork.

## Public RPC discovery rejected with 429 ANON_COST_LIMITED

**Observed:** 6 November 2026, approximately 15:44–15:50 IST. SDK 1.0.1, Rabdi 7794095, server-side `rabdi({ accessKey: "" })`. This is a separate incident from the earlier publication-status issue above.

**Expected:** a discovery query would return offers or an explicit quota error that the app could handle. A failed query should not look like an empty market.

**What happened:** `eth_chainId` succeeded, while `arkiv_query` returned HTTP **429** with `ANON_COST_LIMITED`. Our API initially hid that behind HTTP 503 and a generic error; the UI displayed zero listings and bids. Reducing the query page from 25 entities to 5 still failed. The PostgreSQL catalog returned eight stored orders; subsequently the Arkiv view recovered to four listings and two bids with browser cache off. We did not measure the rate-limit reset interval or establish data loss.

**Configuration finding:** the original project and `garuda-full` had the same publisher signing key, but neither local environment had an RPC access key. A signing key authorizes writes; it does not authenticate query quota. The public endpoint recovered without an access key being added.

**Reproduction conditions:** use a configured Garuda database/deployment and the anonymous public Rabdi endpoint. This depends on upstream allowance and is not guaranteed to fail on every run. Do not generate excess traffic to force it.

```sh
# In a local environment without ARKIV_ACCESS_KEY:
npm run server
# In another terminal:
curl -i 'http://127.0.0.1:3213/api/garuda/sales?source=arkiv&preview=1&kind=listing&sort=price&direction=asc'
```

The query scopes v2 entities to our publisher and Ethereum deployment, filters unexpired listings and sorts by `price:u256`. Use [the standalone query](schema.md#query) to distinguish an upstream query rejection from an API/UI failure. The historical generic 503 is now replaced with an explicit 429 message when the upstream response is 429.

**What we changed:** surfaced the rate-limit error, added an explicit catalog fallback, stopped interval polling after an order-book failure, avoided immediate rate-limit retries, and displayed unknown counts instead of zero. TypeScript and 40 Arkiv tests passed, including a throttling regression. [Full incident record](../docs/struggles.md).

**What Arkiv could improve today:** expose a stable SDK error type for quota failures, distinguish per-query cost from exhausted allowance, include retry/reset and remaining-budget information, and show a realistic marketplace query budget in the quickstart. Document the difference between the publisher signing key and RPC access key next to the first write example. These would let us give users a useful recovery action without inspecting raw transport errors.

**Remaining action:** configure a Rabdi `ARKIV_ACCESS_KEY` on the server and verify a real discovery query. A successful chain-ID call is insufficient. Access keys raise limits but retain quotas; see [Arkiv access-key documentation](https://docs.arkiv.network/start-here/access-keys/).

## Time-based orders meet block-based entity expiration

A Seaport order has an exact Unix deadline, while the Arkiv entity expiry is scheduled against Rabdi blocks. In our bid read-back, signed expiry was 2026-11-06 13:10:23 UTC; the explorer estimated entity expiry at 13:10:24 UTC. This is expected block rounding, not a failed write. We keep a separate indexed Unix deadline and filter it on every active query.

Reproduce: open [the bid entity](https://rabdi.explorer.arkiv.network/entity/0x757c37b009ce7f1adee68722660543c832d4ef3e2896bcfb2e0520149094b0f7) and compare the `expires` field with the entity lifetime. Improvement: document this pattern prominently for offers and tasks where one second matters.

## Retry safety needs application coordination

A request can succeed on-chain before a caller receives or stores its receipt. Retrying a generic create could duplicate an offer. We use a durable queue, a publisher lock, indexed order-hash lookup and read-back verification. This is a failure mode exercised in our tests, not a claim that the SDK duplicated one of our live orders.

Improvement: a documented idempotent create-by-application-key recipe, including multi-process nonce coordination, would reduce boilerplate. Tests live in [test-arkiv.mjs](../scripts/test-arkiv.mjs).
