# How Garuda uses Arkiv

| Arkiv feature | Implementation | What users see |
| --- | --- | --- |
| Queryable entities | Schema + publisher + scope + kind + expiry filters; optional maker/NFT filters | For sale and Purchase bids come from Arkiv by default |
| Chosen expiration | Entity lifetime follows the signed order deadline | Expired offers disappear from active discovery |
| Wallet-owned data | Dedicated publisher owns entities; signed maker/owner fields identify Ethereum parties | Entity links expose the origin of a published offer |
| Public reads | The SDK reads signed envelopes; Garuda verifies them against the original anchor and Ethereum | A discovered offer is only actionable when current checks pass |
| Short-lived snapshots | Five-minute freshness limit, 15-minute entity lifetime, canonical block checks | Stake principal, maturity and accrued interest load from a reusable cache |

Accepted orders and publication requests are saved in the same PostgreSQL transaction. A worker claims a request, validates the order, acquires a publisher lock, checks for an existing entity, publishes if needed and reads it back. Failure leaves a retryable request with capped exponential backoff. An expired or invalidated order stops publication. Restarting the service does not lose queued work.

The Market has an explicit **Arkiv / All orders** source control. The catalog exposes orders awaiting publication; its data is not labeled as Arkiv. Arkiv failures show a retry action and an explicit catalog alternative. Selected order details and cards link to the published entity. Approvals and settlement still require the user's Ethereum wallet confirmation.

Code: [queue](../server/market/publication.ts), [order writes and reads](../server/market/arkiv.ts), [stake cache](../server/market/stake-cache.ts), [Market queries](../src/lib/market/queries.ts), [source control](../src/components/market/ArkivSource.tsx). Verification: `npm test` and [live evidence](evidence.md).
