# Live Arkiv evidence

## V2 listings and bids

Verified **6 November 2026 at 02:43 UTC (08:13 India time)** on Rabdi, chain **7794095**. Schema: `wiseone.garuda.orders.v2`. Arkiv entity owner/creator: `0x8d5b491D2c843F6B996De1EC66269809138cA60A`.

| Order | Arkiv entity | Publication transaction |
| --- | --- | --- |
| Signature Stake #20 listing, 20 WISE | [View v2 entity](https://rabdi.explorer.arkiv.network/entity/0x42bcdf1507105a321cfb43d6aa14890d8c23507e15ce9f6e642e17991f33b4c8) | [View transaction](https://rabdi.explorer.arkiv.network/tx/0xc1ea6dc7e0b2bc6ae4f757b211dc1bc17b1b5bedce0d011b68e10349419bd31a) |
| Signature Stake #40 listing, 42,000 WISE | [View v2 entity](https://rabdi.explorer.arkiv.network/entity/0x586e6195475e49a9b3bc03fbada5b6eaac2cfdebd874a061aadfc5bc43e73df5) | [View transaction](https://rabdi.explorer.arkiv.network/tx/0xcb01e10e18300ec13015e3e7646a432a5d736332c3d492aa4549ea7a792c2e7d) |
| Signature Stake #20 purchase bid, 15 WISE | [View v2 entity](https://rabdi.explorer.arkiv.network/entity/0x8219b6b1ea667898b94e1c9dde770fa40dcc49fd56862f0354a619f75cce2e1d) | [View transaction](https://rabdi.explorer.arkiv.network/tx/0x2c325e2d097ade2df1fb9e7ad9572cd5d72080ebe3678766feaefa690f8efcc9) |

| Order | Signed deadline (UTC) | Deadline (Unix seconds) | Ethereum observation block |
| --- | --- | --- | --- |
| Signature Stake #20 listing, 20 WISE | 2026-11-06 12:55:11 | 1793969711 | [26352889](https://etherscan.io/block/26352889) |
| Signature Stake #40 listing, 42,000 WISE | 2026-11-06 12:48:59 | 1793969339 | [26352891](https://etherscan.io/block/26352891) |
| Signature Stake #20 purchase bid, 15 WISE | 2026-11-06 13:10:23 | 1793970623 | [26352881](https://etherscan.io/block/26352881) |

Verification performed:

- Confirmed Ethereum availability before writing, including maker signature, owner, approval, funds where required, stake state and original publication anchor.
- Loaded fresh stake metadata from a known Ethereum block; checked underlying stake ID, state hash, ownership epoch, maturity and canonical block hash.
- Preserved the original envelope, signed deadline and original database publication time.
- Read each entity through the typed v2 schema and compared the indexed fields and stored payloads. Checked each publication transaction receipt for success.
- Repeated the bid publication after an Ethereum RPC timeout: the existing v2 entity was reused, with its original receipt retained.
- Skipped the 2,000 WISE listing for Signature Stake #53 because its current status was `unapproved`. No approval transaction or new maker signature was requested.

The following direct Arkiv query returned the 15 WISE bid and its exact indexed values:

```sh
npm run arkiv:query -- bid --minPrice=10000000000000000000 --maxPrice=20000000000000000000 --sort=shares --direction=desc
```

Its indexed principal was `10000000000000000000` base units (10 WISE), with `23989698281516228920` raw shares. The bid price was `15000000000000000000` base units. The 42,000 WISE listing records `32000000000000000000000` principal and `70203579453902617027291` raw shares.

The running Garuda API returned HTTP 200 with `source: arkiv`: the listing query with a 20 WISE minimum returned #20 and #40 with their v2 entity keys; the bid query returned #20 with its v2 key. All three reported `available` after Ethereum checks. Local validation passed 88 tests, TypeScript checking and a Vite production build.

Use the [schema and query reference](schema.md#query) to reproduce price, principal, share and maturity searches. These are expiring records, so future reads need not return the same rows. These publications did not settle a mainnet trade or extend any offer.

## Success-modal publication check

Verified **6 November 2026** for a newly signed Signature Stake #40 listing at **42,000 WISE**, expiring **13 November 2026 at 03:08:35 UTC**. This is a separate order from the earlier #40 listing above.

- Order hash: `0x72662714f70b11c5871993e5ef358159d96c3326184b097642c5d6a983de21a9`.
- [Arkiv entity](https://rabdi.explorer.arkiv.network/entity/0xbb5e914a65a4967fb730bb76e69d1c923802a8aebb39700577a62de34a7dd027).
- [Publication transaction](https://rabdi.explorer.arkiv.network/tx/0x02feeaa9008a510cd52ee5b166d20c02e64c3865dcc8603672fac0a24230458c): SDK receipt `status: success`, Rabdi block **274557**.

A fresh `reader.getEntity(entityKey, ArkivListings)` returned the exact order hash, `tokenId: 40` and `kind: listing`. The browser-facing status route returned HTTP 200 with `state: published` and these identifiers. The success modal displayed both explorer links. These were read-only verification calls; no new signature, order publication or asset transfer was initiated during verification.

Run this exact lookup in the [Rabdi entity explorer](https://rabdi.explorer.arkiv.network/entity-explorer):

```text
arkiv.schema = str('wiseone.garuda.orders.v2') AND $owner = addr(0x8d5b491D2c843F6B996De1EC66269809138cA60A) AND orderHash = str('0x72662714f70b11c5871993e5ef358159d96c3326184b097642c5d6a983de21a9')
```

The entity is temporary and may be absent after its expiry. The earlier unavailable/pending UI and the confirmed result are documented in [integration feedback](friction.md#saved-orders-and-confirmed-arkiv-publication-need-distinct-feedback); no publication-latency figure was measured.

## Earlier v1 references

These original Garuda records remain historical references; the v2 table above is the current example set.

| Order | Entity | Publication transaction |
| --- | --- | --- |
| Signature Stake #20 listing, 20 WISE | [Entity](https://rabdi.explorer.arkiv.network/entity/0x3b43f78444e67a97578e67fe70a7fed914d2a5061642072670b397207c31968d) | [Transaction](https://rabdi.explorer.arkiv.network/tx/0x52af21cf776b59560940b43721b2c48c0462a7ce1a88e4120070620cb89f3584) |
| Signature Stake #40 listing, 42,000 WISE | [Entity](https://rabdi.explorer.arkiv.network/entity/0x6e7ca02501fff22985e5f727facdb675f56471d08f21e58c0e55be5f54f13587) | [Transaction](https://rabdi.explorer.arkiv.network/tx/0x7125d44b38861f9a5b30c113736999f96a1c38fbf813987e527967fdff131b52) |
| Signature Stake #20 bid, 15 WISE | [Entity](https://rabdi.explorer.arkiv.network/entity/0x757c37b009ce7f1adee68722660543c832d4ef3e2896bcfb2e0520149094b0f7) | [Transaction](https://rabdi.explorer.arkiv.network/tx/0x0cca6b67baece4aa8df1d4ef1374e542a6318f98b5721cc1ba42c3e1afa57b5c) |

## Local API verification

`npm run test:market:api` passed for Signature Stakes #20 and #53 on a disposable latest-block Ethereum fork. Both listings and bids were accepted through the Garuda route handlers, survived PostgreSQL reconnection with their queued publication state, and became sold after fork settlement. The test used a temporary database schema, removed it, and reverted the fork. These checks did not transfer real assets or publish test orders to Rabdi.

The Market browser check returned two sale listings and one purchase bid from Arkiv, with working entity links. Two successive reads of Signature Stake #20 details returned `source: ethereum`, then `source: arkiv`, confirming the user-visible stake data is read back from the snapshot cache.
