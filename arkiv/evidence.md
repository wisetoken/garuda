# Live Arkiv evidence

Observed 6 November 2026, India time (5 November UTC), using SDK reads and the Rabdi explorer. Network 7794095. Entity owner/creator: `0x8d5b491D2c843F6B996De1EC66269809138cA60A`. Namespace: `wiseone.garuda.orders.v1`.

| Order | Entity | Signed expiry (Unix seconds) |
| --- | --- | --- |
| Listing: Signature Stake #20, 20 WISE | [0x3b43…968d](https://rabdi.explorer.arkiv.network/entity/0x3b43f78444e67a97578e67fe70a7fed914d2a5061642072670b397207c31968d) | 1793969711 |
| Listing: Signature Stake #40, 42,000 WISE | [0x6e7c…3587](https://rabdi.explorer.arkiv.network/entity/0x6e7ca02501fff22985e5f727facdb675f56471d08f21e58c0e55be5f54f13587) | 1793969339 |
| Bid: Signature Stake #20, 15 WISE | [0x757c…b0f7](https://rabdi.explorer.arkiv.network/entity/0x757c37b009ce7f1adee68722660543c832d4ef3e2896bcfb2e0520149094b0f7) | 1793970623 |

The original namespace read returned two listing entities, for #53 and #20, under `wiseone.yoda.orders.v1`. The new publisher only republishes orders that pass current Ethereum availability checks. It does not fabricate replacement signatures or reset their original publication blocks.

Reproduce with `npm run arkiv:query`, or use the [explorer query](schema.md#query). These are expiring records, so future reads need not return the same rows. Entity history may remain visible after active data expires. Local application verification uses `/api/garuda/sales?source=arkiv&kind=listing` and `kind=bid`.

These testnet publications copied existing public, signed Ethereum offers. They did not execute a mainnet trade. Settlement verification uses a separate disposable Ethereum fork with test accounts.

## Local API verification

`npm run test:market:api` passed for Signature Stakes #20 and #53 on a disposable latest-block Ethereum fork. Both listings and bids were accepted through the Garuda route handlers, survived PostgreSQL reconnection with their queued publication state, and became sold after fork settlement. The test used a temporary database schema, removed it, and reverted the fork. These checks did not transfer real assets or publish test orders to Rabdi.

The Market browser check returned two sale listings and one purchase bid from Arkiv, with working entity links. Two successive reads of Signature Stake #20 details returned `source: ethereum`, then `source: arkiv`, confirming the user-visible stake data is read back from the snapshot cache.
