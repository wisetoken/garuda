# Arkiv schema

Network: Rabdi, chain 7794095. SDK: `@arkiv-network/sdk` 1.0.1. Definitions live in [orders](../server/market/arkiv.ts) and [stake snapshots](../server/market/stake-cache.ts).

## Signed orders: `wiseone.garuda.orders.v1`

| Field | Type | Indexed | Meaning |
| --- | --- | --- | --- |
| scope | str | Yes | Hash of the Ethereum deployment scope |
| orderHash | str | Yes | Canonical signed order hash; deduplication key |
| kind | str | Yes | `listing` or `bid` |
| maker | str | Yes | Lowercase Ethereum signer address |
| owner | str | Yes | Lowercase committed NFT owner address |
| collection | str | Yes | Lowercase NFT contract address |
| tokenId | str | Yes | Decimal NFT ID |
| format | str | Yes | `seaport-1.6` |
| expires | u64 | Yes | Exact signed deadline in Unix seconds |
| envelope | bytes | No | UTF-8 JSON containing the order and its signature |

The dedicated publisher wallet owns the entities. It can modify or delete its entities at the Arkiv protocol level. Garuda only creates immutable order copies; price or duration changes require a newly signed order. Discovery scopes by publisher, schema and deployment. Payload attributes are checked against the signed envelope and the retained original database record, then availability is rechecked on Ethereum. A publisher is not permitted to create an executable order without the maker's valid Ethereum signature.

Entity expiration uses `ExpirationTime.atDate` at the signed deadline. Rabdi expresses expiry in blocks, so the independent indexed `expires` filter enforces the exact wall-clock cutoff. Cancellation, sale or changed ownership can invalidate an entity earlier; it may remain publicly queryable until expiry, but cannot enable settlement. The supported order lifetime is at most 30 days.

## Display cache: `wiseone.garuda.stakes.v1`

Indexed `str` fields: `scope`, `collection`, `owner`, `tokenId`. Indexed `u64`: `observedAt` (Unix seconds). Non-indexed `bytes`: `snapshot` (JSON principal, shares, accrued interest, term, status and Ethereum block number/hash).

The same publisher owns these entities. Snapshot entities expire after 900 seconds. Readers accept observations no older than 300 seconds, validate the stake identity and check the canonical Ethereum block hash. A cache miss or Arkiv failure falls back to a fresh Ethereum read. Neither cached ownership nor cached interest is used as settlement authority. Writes are capped at 24 refreshes/hour/deployment and deduplicated while a fresh snapshot exists.

## Query

Use `npm run arkiv:query -- bid` to query the current unexpired bids directly. In the [Rabdi entity explorer](https://rabdi.explorer.arkiv.network/entity-explorer), run:

```text
arkiv.schema = str('wiseone.garuda.orders.v1') AND $owner = addr(0x8d5b491D2c843F6B996De1EC66269809138cA60A) AND scope = str('0x5654d6227687e017ee3fbffa1e02578e042e7388c1a07c3537aca37bf5d79ef3') AND kind = str('bid')
```

This explorer query includes any still-stored bid in the deployment. The CLI additionally filters `expires` against the current Unix time. The public app route `/garuda/?screen=trade&view=market&book=bids&source=arkiv` reads this data through `/api/garuda/sales?source=arkiv&kind=bid`, then checks Ethereum availability.
