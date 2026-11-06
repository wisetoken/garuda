# Arkiv schema

Network: Rabdi, chain **7794095**. SDK: `@arkiv-network/sdk` 1.0.1. Definitions: [orders](../server/market/arkiv-schema.ts), [query filters](../server/market/arkiv-filters.ts), and [stake cache](../server/market/stake-cache.ts).

## Signed orders: `wiseone.garuda.orders.v2`

The schema has 30 application fields, plus the SDK schema tag. All fields below are indexed except `snapshot` and `envelope`. Amounts stay integers throughout publication and querying; no floating-point rounding is used.

| Fields | Type | Meaning |
| --- | --- | --- |
| `scope` | str | Hash of the Ethereum deployment scope |
| `orderHash` | str | Canonical signed order hash; deduplication key within the scope |
| `kind`, `format` | str | `listing` or `bid`; `seaport-1.6` |
| `maker` | addr | Ethereum signer: seller for a listing, buyer for a bid |
| `stakeOwner` | addr | NFT owner committed by the signed order |
| `collection`, `tokenId` | addr, u256 | NFT contract and exact numeric ID |
| `chainId` | u64 | Settlement chain, Ethereum mainnet (`1`), distinct from Arkiv's chain ID |
| `currency` | addr | Settlement token contract |
| `currencySymbol`, `currencyDecimals` | str, u64 | `WISE`, `18` for the supported market |
| `price` | u256 | Signed asking price or bid amount, in token base units |
| `stakeType`, `stakeId` | str | `signature` or `advanced`; underlying stake identifier |
| `stateHash` | str | Stake state committed by the signed order |
| `principal`, `shares` | u256 | Stake principal in WISE base units; raw protocol share units (not WISE) |
| `stakeStartAt`, `maturesAt` | u64 | Earning start and maturity, as Unix seconds |
| `durationDays` | u64 | Original stake term in days |
| `orderStartAt`, `expires` | u64 | Exact signed order start and deadline, as Unix seconds |
| `publishedAt` | u64 | First acceptance time retained in Garuda's database, as Unix seconds |
| `indexedAt` | u64 | Time this v2 copy was prepared, as Unix seconds |
| `observedAt` | u64 | Timestamp of the Ethereum block used to read the stake |
| `blockNumber`, `blockHash` | u64, str | Ethereum block provenance for the stake fields |
| `snapshot` | bytes, not indexed | JSON stake observation used to validate the derived indexed fields |
| `envelope` | bytes, not indexed | Unchanged UTF-8 JSON containing the signed order and its signature |

`stakeStartAt` is the earning start, not a claimed creation-transaction timestamp. `publishedAt` is a database observation, not an Ethereum event timestamp. Hashes are strings: Arkiv entity-reference keys are not used for Ethereum hashes.

The dedicated publisher wallet owns the Arkiv entities. `maker` and `stakeOwner` identify Ethereum parties; they do not grant Arkiv edit permission. The publisher can modify or delete its entities at the protocol level, but Garuda only creates immutable signed-order copies. A price or duration change needs a new maker signature. Discovery validates the indexed fields against the envelope and stored snapshot, retains the original database publication block, then checks current Ethereum availability. Fresh metadata is read and its committed stake state checked before publication.

Principal, shares, ownership and maturity describe the observed block. A later transfer, interest scrape, cancellation or sale can invalidate the order. There is no permanently indexed claim that an order is available, and cached earnings are not settlement authority.

Initial entity expiration uses `ExpirationTime.atDate` at the original signed deadline. The storage-extension flow may retain the record longer, without changing its signed trading deadline. Rabdi expresses expiry in blocks, so the independent `expires > now` query enforces the exact wall-clock cutoff. Orders can become invalid before their entities expire. The supported order lifetime is at most 30 days; republication does not extend it.

### Compatibility

`wiseone.garuda.orders.v1` remains readable. Its indexed fields are strings (`scope`, `orderHash`, `maker`, `owner`, `kind`, `collection`, `tokenId`, `format`) and `expires` (`u64`), with a non-indexed `envelope`. The publication queue records the schema version and queues valid older orders for v2. V2 pages come first, then legacy pages; duplicate order hashes are suppressed. Numeric range queries use only v2 because legacy entities lack those fields. Sorting applies to v2 results; legacy fallback pages retain their original hash order.

## Display cache: `wiseone.garuda.stakes.v1`

Indexed `str` fields: `scope`, `collection`, `owner`, `tokenId`. Indexed `u64`: `observedAt` (Unix seconds). Non-indexed `bytes`: `snapshot` (JSON principal, shares, accrued interest, term, status and Ethereum block number/hash).

The same publisher owns these disposable display-cache entities. They are not the stake NFT and do not contain the signed listing or bid. Their expiry neither ends the Ethereum stake nor cancels its offers. Each cached observation expires from Arkiv after 900 seconds. Readers accept observations no older than 300 seconds, validate stake identity and check the canonical Ethereum block hash. A cache miss or Arkiv failure falls back to Ethereum. Neither cached ownership nor interest is used as settlement authority. Writes are capped at 24 refreshes/hour/deployment and deduplicated while a fresh snapshot exists.

## Query

These commands query Arkiv directly without loading a signer:

```sh
npm run arkiv:query -- bid
npm run arkiv:query -- listing --minPrice=20000000000000000000 --sort=price --direction=asc
npm run arkiv:query -- listing --minPrincipal=1000000000000000000000 --sort=shares --direction=desc
```

The second query asks for listings priced at least **20 WISE**. The third asks for at least **1,000 WISE principal**, ordered by raw share count. Expired records are excluded automatically.

Supported filters: `kind`, `maker`, `stakeOwner`, `currency`, `stakeType`, `tokenId`, `minPrice`, `maxPrice`, `minPrincipal`, `minShares`, `maturesAfter`, `maturesBefore`. Sort fields: `price`, `principal`, `shares`, `maturesAt`, `publishedAt`, `expires`; direction: `asc` or `desc`. Numeric bounds are inclusive. Amount filters use base units; maturity filters use Unix seconds. The CLI reads 25 records per page and accepts `--before=25` for the next offset.

The app requests `preview=1` to render indexed rows and display snapshots before Ethereum checks finish. Preview rows have status `checking` and cannot authorize a purchase. The app verifies availability independently through `/sales/:hash`, and trade review still performs fresh checks. Display snapshots up to 24 hours old may seed the table while stake details refresh; the detail cache accepts only canonical observations no older than 300 seconds.

The API uses the same indexed filters:

```text
/api/garuda/sales?source=arkiv&kind=listing&minPrice=20000000000000000000&sort=price&direction=asc
```

In the [Rabdi entity explorer](https://rabdi.explorer.arkiv.network/entity-explorer), run:

```text
arkiv.schema = str('wiseone.garuda.orders.v2') AND $owner = addr(0x8d5b491D2c843F6B996De1EC66269809138cA60A) AND scope = str('0x5654d6227687e017ee3fbffa1e02578e042e7388c1a07c3537aca37bf5d79ef3') AND kind = str('listing') AND price >= u256(20000000000000000000) ORDER BY price:u256 ASC
```

The explorer query includes any still-stored matching listing; add an `expires` cutoff for active-only results. The app route `/garuda/?screen=trade&view=market&book=bids&source=arkiv` reads bids through the API, then checks Ethereum availability.
