# WiseOne | Garuda Extension implementation plan

This document describes the implementation sequence and design decisions. Issue status is tracked with beads; it is not duplicated here. Work stays on `master`, with small local commits, Codex co-authorship, no package-lock changes, and no push until requested. Source files stay below 500 lines.

## Starting point

The app has wallet connection, live Signature and Advanced stake portfolios, and signed Seaport orders. Signature sales and purchase bids can transfer full NFT ownership in exchange for WISE. Fork verification covers active and matured stakes, exact payment and fees, unchanged underlying stake terms, and rejected stale or invalid orders. Advanced trading requires a configured validator.

An existing Arkiv integration publishes signed orders manually and caches stake snapshots under `wiseone.yoda`. A read of Rabdi on 6 November 2026 found two listing entities, for Signature Stakes #53 and #20, owned by publisher `0x8d5b491D2c843F6B996De1EC66269809138cA60A`. This is existing work, not a new event contribution.

## Consistent stake identity

Use “Signature Stake #…” and “Advanced Stake #…” in cards, trade reviews, order details and accessible labels. Keep the WiseOne teal logo for stakes and the WISE token logo for currency. Collection names in contract data remain unchanged.

## Garuda market service

Keep signed-order verification and the immutable Ethereum publication block in the market database. Add a small Garuda API service rather than coupling market publication to the homepage. Configure its deployment, database and RPC on the server. Private publisher keys must never enter browser configuration or git.

Use `/api/garuda` for the market. Preserve existing signed orders and publication anchors. The original publication block remains necessary to reject a signature after its NFT has been transferred away and back; an Arkiv re-publication must not reset that protection.

## Arkiv order discovery

Publish listings and purchase bids to `wiseone.garuda.orders.v1` on the current Arkiv Rabdi testnet, chain 7794095. Store the signed envelope and queryable deployment scope, order hash, kind, maker, stake owner, collection, token ID and expiry. Use a dedicated server publisher; the entity owner is that publisher, while the order maker is authenticated by the Ethereum signature. Do not describe these entities as user-owned.

Match each entity's expiration to the signed order deadline. Expiration removes discovery data; it does not cancel the Ethereum signature before its deadline. Cancellation and settlement are always checked on Ethereum, so an unexpired entity cannot make an unavailable order executable.

Persist a publication request when an order is accepted. Retry temporary Arkiv failures with bounded backoff and deduplicate by deployment and order hash under a publisher lock. Read the entity back before reporting publication success. Never lose an already signed order because Arkiv is unavailable.

The Market will expose Arkiv discovery as a visible data source, with entity links and publication state. Query by listing or bid, collection and expiration, and support maker/token filtering. Verify discovered payloads, publisher, original publication anchor and current Ethereum availability before enabling trading. Show source failures explicitly; a database fallback must not be presented as an Arkiv result.

## Stake snapshots

Use `wiseone.garuda.stakes.v1` for short-lived, publicly readable display snapshots. Include collection, token ID, observed owner and block provenance. Recheck canonical block hashes and use fresh Ethereum reads before approvals or settlement. Cached balances, yield and ownership are never authority to transfer a stake.

## Verification and evidence

Test listing and bid publication, exact expiry, idempotent retries, malformed or mismatched entities, wrong publishers, reorgs, cancellation, transfer-away-and-back protection and Arkiv outages. Exercise both source views in the browser. Publish only already public, valid market orders during integration checks; new mainnet orders and transfers still require the user's wallet action.

Record actual Rabdi entity keys, publisher address and runnable queries. Do not claim a live integration from mocks alone. Keep testnet checks separate from the isolated Ethereum fork tests.

## Continuity submission

Maintain `arkiv/schema.md`, `arkiv/friction.md`, `arkiv/reach.md`, `arkiv/why-arkiv.md` and `arkiv/how-you-use-arkiv.md`. README must distinguish what existed before the event from new work, disclose AI assistance, and include the writer address and a query. Report only measured usage and observed friction. Use the MIT License. Confirm event timing and Continuity eligibility before claiming qualification.

References: https://ethglobal.com/events/mumbai/prizes/arkiv and https://docs.arkiv.network/.

## Later application work

Complete funding and stake-backed lending as separate features. Lending needs explicit borrower requests, lender offers, collateral custody rules, repayment/default behavior and verified contracts before signing or funding is enabled. Finish the homepage after the application flows are established.
