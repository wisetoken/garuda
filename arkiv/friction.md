# Arkiv integration feedback

Environment: `@arkiv-network/sdk` 1.0.1, Rabdi chain 7794095, Node.js 22+, verified 6 November 2026 (India time).

## Public RPC limits are easy to miss during setup

Constructing `rabdi({ accessKey: '' })` prints a warning that the public endpoint is heavily rate limited. A simple application can make several discovery, chain-ID and read-back requests for one interaction. We added a server-side access-key setting, reused the runtime client and bounded publication/cache writes. We did not record a reproducible HTTP 429 in this verification, so this is setup feedback rather than a claimed outage.

Reproduce: leave `ARKIV_ACCESS_KEY` empty and run `npm run arkiv:query`. Improvement: an end-to-end marketplace example with request budgeting, cached clients and retry guidance would make the intended production setup clearer.

## Time-based orders meet block-based entity expiration

A Seaport order has an exact Unix deadline, while the Arkiv entity expiry is scheduled against Rabdi blocks. In our bid read-back, signed expiry was 2026-11-06 13:10:23 UTC; the explorer estimated entity expiry at 13:10:24 UTC. This is expected block rounding, not a failed write. We keep a separate indexed Unix deadline and filter it on every active query.

Reproduce: open [the bid entity](https://rabdi.explorer.arkiv.network/entity/0x757c37b009ce7f1adee68722660543c832d4ef3e2896bcfb2e0520149094b0f7) and compare the `expires` field with the entity lifetime. Improvement: document this pattern prominently for offers and tasks where one second matters.

## Retry safety needs application coordination

A request can succeed on-chain before a caller receives or stores its receipt. Retrying a generic create could duplicate an offer. We use a durable queue, a publisher lock, indexed order-hash lookup and read-back verification. This is a failure mode exercised in our tests, not a claim that the SDK duplicated one of our live orders.

Improvement: a documented idempotent create-by-application-key recipe, including multi-process nonce coordination, would reduce boilerplate. Tests live in [test-arkiv.mjs](../scripts/test-arkiv.mjs).
