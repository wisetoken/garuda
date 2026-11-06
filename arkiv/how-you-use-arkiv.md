# How Garuda uses Arkiv

| Arkiv feature | Implementation | What users see |
| --- | --- | --- |
| Queryable order entities | Schema, publisher, deployment, kind and expiry filters; typed wallet and NFT identity fields | For sale and Purchase bids come from Arkiv by default |
| Numeric indexes | Exact `u256` prices, principal and shares; `u64` maturity and deadlines | Price, principal, start date and expiry sorting reaches Arkiv before pagination; the Market also queries price and maturity ranges |
| Chosen expiration | Entity lifetime follows the signed order deadline | Expired offers disappear from active discovery |
| Wallet-owned data | Dedicated publisher owns entities; maker and stakeOwner identify the Ethereum parties | Entity links expose the origin and terms of an offer |
| Public reads | SDK reads signed envelopes, which Garuda checks against the original publication anchor and Ethereum | An offer is actionable only when current checks pass |
| Block provenance | Indexed block number/hash and observation time accompany the stake snapshot | Other readers can identify the Ethereum observation behind indexed stake fields |
| Short-lived display snapshots | Five-minute freshness limit, 15-minute entity lifetime, canonical block checks | Principal, maturity and accrued interest load from a reusable cache |

Accepted orders and publication requests are saved in the same PostgreSQL transaction. A worker claims a request, validates the order, acquires a publisher lock, checks for an existing v2 entity, reads fresh stake metadata, publishes if needed and verifies the entity read-back. Failure leaves a retryable request with capped exponential backoff. Expired or invalidated orders stop publication. Restarting the service does not lose queued work.

The queue records the schema version. Existing valid signed orders can be republished as v2 without changing signatures, prices, deadlines or their original Ethereum publication blocks. V1 remains readable with duplicate suppression. Range queries use v2; metadata absent from v1 is not invented.

The Market has an explicit **Arkiv / All orders** source control. The catalog exposes orders awaiting publication; its data is not labeled as Arkiv. Arkiv failures show a retry action and an explicit catalog alternative. Selected order details and cards link to the published entity. Approvals and settlement require the user's Ethereum wallet confirmation.

Reproduce the indexed searches using the [schema queries](schema.md#query). The Market filter menu queries exact stake IDs, full owner/bidder addresses, collection, WISE price bounds and UTC maturity dates on Arkiv before pagination. Address searches match either the maker or stake owner. Search is debounced; changing an indexed filter starts a new query and resets its pages. Price inputs are converted to exact 18-decimal base units; the end date includes the entire UTC day. For example:

```text
/api/garuda/sales?source=arkiv&preview=1&kind=listing&minPrice=1000000000000000000000&maturesAfter=1798761600
```

This queries listings asking at least 1,000 WISE whose stakes mature on or after 1 January 2027. The same filters work with `kind=bid`. Partial text searches, current stake status and order availability are applied to loaded results; menu counts describe those results, not the entire index. Users can load further pages. Selecting All orders applies the same filters locally to catalog results. Share and principal minimums remain available through the API and CLI.

Code: [queue](../server/market/publication.ts), [order writes and reads](../server/market/arkiv.ts), [typed schema](../server/market/arkiv-schema.ts), [stake observation](../server/market/arkiv-metadata.ts), [stake cache](../server/market/stake-cache.ts), [Market queries](../src/lib/market/queries.ts). Verification: `npm test` and [live evidence](evidence.md).
