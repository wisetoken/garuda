# Why Arkiv

A stake owner needs another person to discover a listing; a buyer needs their bid to be discoverable by that owner. These signed, time-limited offers are useful shared data. Arkiv makes the envelopes queryable by collection, NFT, maker and expiry without giving another client access to our PostgreSQL database. Other tools can inspect the same published offer and its signature through the public SDK or explorer.

With only a private database, users would depend on our API to retrieve these published envelopes. Arkiv adds an independent read path and explicit expiration. The hosted Market queries Arkiv through our API; the downloadable backup can query Arkiv directly without that API. This is operational discovery and recovery data, not only an audit log. [Run the query](schema.md#query) or inspect [the live entities](evidence.md).

We retain signed orders and their original Ethereum publication anchors in PostgreSQL. Published copies are independently readable, but the normal marketplace still uses those anchors and the market service to validate and serve its catalog. We do not claim a fully server-independent order book. Resetting an anchor on re-publication could incorrectly revive a signature after the NFT transferred away and back.

Ethereum keeps NFT custody, WISE balances, allowances, counters, cancellations and atomic settlement. Private publisher credentials, wallet sessions and personal data are not stored on Arkiv. Short-lived stake snapshots are display caches only. The server owns Arkiv entities; the user owns and signs the Ethereum position/order. Those are different guarantees.

## How this strengthens CROPS

The strongest claim is an independently readable published order, paired with a tool that works without Garuda. Once publication succeeds, the user can recover supported signed terms directly from Arkiv even when our API or database is unavailable. That reduces dependence on us for recovery and supports the censorship-resistance property. The normal market still uses PostgreSQL; publication, retention and RPC availability remain dependencies. Public offers are a deliberate privacy trade-off, not a claim of anonymous trading.

The saved tool currently targets the original V1 Signature settlement deployment and WISE orders. Its `wiseone.garuda.orders.v2` record support refers to the Arkiv schema, not the new V2 settlement contract. V2-specific discovery, export/import and individual cancellation still need integration and verification. Do not demonstrate a new V2 order as supported individual recovery until that work is complete.

## What users lose if we replace it with a private database

PostgreSQL can store and filter the same fields, and we already use it for the service catalog. The loss would be the independently readable published copy: another client could no longer inspect the same signed envelopes without our API or database access. The backup's “Find my published orders” path would also lose its external source; a user would need a prior local export or another replica. Onchain recovery actions that do not need an order envelope would still work.

This is not a claim that no other database could provide public access or replication. It is the concrete benefit of this integration: a queryable, externally hosted copy with entity ownership, provenance and explicit lifetime. More copies improve the available recovery options; they do not guarantee availability or permanent storage.

## What stays off Arkiv, and why

| Data or responsibility | Location and reason |
| --- | --- |
| Private keys and wallet authentication | User wallet/provider and server secret configuration; never public entity fields |
| NFT ownership, WISE balances, approvals, cancellation and settlement | Ethereum is authoritative; a database record cannot transfer assets or make a stale order executable |
| Original publication anchors and operational catalog | PostgreSQL preserves the service's validation history; republication must not reset it |
| Publication queue, retry state and rate-limit accounting | PostgreSQL provides transactional coordination for server jobs |
| Local backup imports and user preferences | User device; no need to publish personal recovery files or UI choices |
| Generated NFT artwork and image metadata (optional) | Swarm holds the larger files; Arkiv makes their references, checksums and observation provenance queryable. Real uploads and verified references are recorded for listings #53 and #61 and a bid for #61. Uploads are opt-in per deployment. See [artwork backups and evidence](../docs/swarm-artwork.md). |

Published envelopes include signatures, wallet addresses and trade terms. They are intentionally public offers, not encrypted private data. RPC operators can observe queries; this integration does not provide anonymous reads. The dedicated publisher controls Arkiv entity updates and can censor publication or delete its copies. Expiry and RPC limits remain dependencies, documented in [feedback](friction.md). User signatures and Ethereum checks constrain what a modified copy can execute; they do not prevent censorship.
