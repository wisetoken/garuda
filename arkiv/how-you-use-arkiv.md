# How Garuda uses Arkiv

| Arkiv feature | Implementation | What users see |
| --- | --- | --- |
| Queryable order entities | Schema, publisher, deployment, kind and expiry filters; typed wallet and NFT identity fields | For sale and Purchase bids come from Arkiv by default |
| Numeric indexes | Exact `u256` prices, principal and shares; `u64` maturity and deadlines | Price, principal, start date and expiry sorting reaches Arkiv before pagination; the Market also queries price and maturity ranges |
| Chosen expiration | Initial lifetime targets the signed deadline; storage can be extended separately | Expired offers disappear from active discovery |
| Wallet-owned data | Dedicated publisher owns entities; maker and stakeOwner identify the Ethereum parties | Entity links expose the origin and terms of an offer |
| Public reads | SDK reads signed envelopes, which Garuda checks against the original publication anchor and Ethereum | An offer is actionable only when current checks pass |
| Block provenance | Indexed block number/hash and observation time accompany the stake snapshot | Other readers can identify the Ethereum observation behind indexed stake fields |
| Short-lived display snapshots | Five-minute freshness limit, 15-minute entity lifetime, canonical block checks | Principal, maturity and accrued interest load from a reusable cache |

Accepted orders and publication requests are saved in the same PostgreSQL transaction. A worker claims a request, validates the order, acquires a publisher lock, checks for an existing v2 entity, reads fresh stake metadata, publishes if needed and verifies the entity read-back. Failure leaves a retryable request with capped exponential backoff. Expired or invalidated orders stop publication. Restarting the service does not lose queued work.

After a listing or bid is saved, its success modal shows the signed amount, deadline and order hash. It polls a lightweight database-backed publication-status endpoint every five seconds while open. Pending publication and failed status reads remain distinct from confirmed publication; entity and transaction links appear only with a validated published receipt. This keeps the signing flow responsive while the worker completes Arkiv publication. See [the live receipt](evidence.md#success-modal-publication-check) and [the status-display issue we encountered](friction.md#saved-orders-and-confirmed-arkiv-publication-need-distinct-feedback).

The queue records the schema version. Existing valid signed orders can be republished as v2 without changing signatures, prices, deadlines or their original Ethereum publication blocks. V1 remains readable with duplicate suppression. Range queries use v2; metadata absent from v1 is not invented.

The Market has an explicit **Arkiv / Graph** source control. The current “Graph” label selects the service catalog in PostgreSQL, not an independent Graph offer index; this naming mismatch is recorded for correction. The catalog exposes orders awaiting publication; its data is not labeled as Arkiv. Arkiv failures show a retry action and an explicit catalog alternative. Selected order details and cards link to the published entity. Approvals and settlement require the user's Ethereum wallet confirmation.

Reproduce the indexed searches using the [schema queries](schema.md#query). The Market filter menu queries exact stake IDs, full owner/bidder addresses, collection, WISE price bounds and UTC maturity dates on Arkiv before pagination. Address searches match either the maker or stake owner. Search is debounced; changing an indexed filter starts a new query and resets its pages. Price inputs are converted to exact 18-decimal base units; the end date includes the entire UTC day. For example:

```text
/api/garuda/sales?source=arkiv&preview=1&kind=listing&minPrice=1000000000000000000000&maturesAfter=1798761600
```

This queries listings asking at least 1,000 WISE whose stakes mature on or after 1 January 2027. The same filters work with `kind=bid`. Partial text searches, current stake status and order availability are applied to loaded results; menu counts describe those results, not the entire index. Further pages load automatically as users approach the end of the results. Selecting the catalog applies the same filters locally to catalog results. Share and principal minimums remain available through the API and CLI.

Code: [queue](../server/market/publication.ts), [order writes and reads](../server/market/arkiv.ts), [typed schema](../server/market/arkiv-schema.ts), [stake observation](../server/market/arkiv-metadata.ts), [stake cache](../server/market/stake-cache.ts), [Market queries](../src/lib/market/queries.ts). Verification: `npm test` and [live evidence](evidence.md).

## Who can change an entity?

The dedicated Rabdi publisher wallet owns order entities. The API validates a maker-signed order before queuing it, and the publisher submits the Arkiv transaction. The maker signs the listing or bid; the stake owner is the seller and may differ from the maker on an incoming bid. Indexed `maker` and `stakeOwner` attributes identify those parties but do not grant Arkiv write permission. Reads are scoped to the expected publisher and deployment.

The current extension endpoint requires an Ethereum message signature from the offer maker: the seller for a listing, and the bidder for a bid. The stake owner cannot extend someone else's bid. It binds the order hash, entity key and exact target timestamp, verifies the existing entity and checks that the order is available before the publisher submits the extension. Users do not receive the publisher key. The operator still controls that key and could edit or remove its entities outside this endpoint; consumers must verify the signed payload and current Ethereum state.

## Two expiries, two user-visible meanings

- **Trading deadline:** signed Unix seconds, indexed as `expires`. Every active discovery query excludes expired offers. Extending storage does not change this signature or deadline.
- **Storage lifetime:** Arkiv's block-based entity expiry. New publication targets the signed deadline. “Extend offer” opens a review modal with the current storage expiry block, trading deadline, and a 7-, 30- or 90-day target from the review time. The wallet signs that exact target before submission. Changing the trading deadline requires a new signed offer.

Records retained beyond their trading deadline can remain readable as records but are not executable offers. There is no permanent-storage claim or automatic indefinite renewal. The extension modal was browser-checked with sample data and its validation tested; those checks did not submit a live extension transaction.

## Failure behavior users can understand

Both listings and bids enter the durable publication queue. A saved order is not labeled published until receipt validation succeeds. RPC throttling produces an explicit error and a catalog fallback, not a false empty-market count. “Use cache” defaults off and controls browser order-result reuse; it does not remove provider limits or server dependencies. Ethereum availability checks remain separate from indexed discovery.

The [standalone backup](../docs/backup-access.md) offers direct Arkiv reads, maker-signature verification and Ethereum checks without the Garuda API. It can recover and export verified own orders and distinguish incoming bids, but it is not a replacement trading UI. The normal hosted discovery path still depends on the service database for original order anchors.

## Swarm artwork references

The optional media worker uses `wiseone.garuda.media.v1` for public references to an SVG artwork snapshot and JSON metadata on Swarm. It indexes deployment scope, order hash, collection, token ID and renderer. The publisher owns these entities, with a 90-day lifetime independent of order deadlines and stake maturity. Files must pass gateway retrieval and checksum checks before the reference is published and the UI reports a completed backup.

The **Artwork backup** viewer supports gateway selection and reference export. This adds another way to retrieve the generated artwork without the original metadata host; the NFT's `tokenURI` is unchanged. On 7 November 2026, real uploads for listings #53 and #61 and a bid for #61 completed through the public Swarm gateway. Both files and the Arkiv manifests were verified; the #61 viewer displayed the real artwork. Uploads are enabled locally and remain opt-in per deployment, with either public-gateway or private Bee configuration. See [live evidence, setup, privacy and retention limits](../docs/swarm-artwork.md). A separate-gateway outage demonstration remains unverified.
