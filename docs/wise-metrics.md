# WISE and WiseOne metrics

Snapshot: **6 November 2026, 04:13:23 UTC / 09:43:23 India time**, Ethereum block [26,353,342](https://etherscan.io/block/26353342). [Recorded values and indexer response](metrics/2026-11-06-wise.json).

## Scope and calculation

All Ethereum reads use the same block as the indexer's `_meta.block`. The indexer reported no indexing errors. Its total staked value exactly matched the WISE contract's `globals()` total at that block: **68,206,522.895888192422764414 WISE**.

| Staking scope | Staked principal | Share of total WISE staked |
| --- | ---: | ---: |
| WiseOne Signature | 21,376,249.035968 WISE | 31.3404% |
| Legacy Advanced | 7,203,250.083286 WISE | 10.5609% |
| Both NFT contracts combined | 28,579,499.119254 WISE | 41.9014% |

WiseOne's application labels the Signature contract as **WiseOne Protocol**. The combined total explicitly includes the separate legacy Advanced collection. These measure principal recorded as staked, rather than liquid ERC-20 balances, current market listings, user counts or trading volume. They do not measure whether every position is still earning.

## Liquidity and ownerless share

The [WISE token](https://etherscan.io/address/0x66a0f676479cee1d7373f3dc2e2952778bff5bd6#readContract) reports [this Uniswap V2 pair](https://etherscan.io/address/0x21b8065d10f73ee2e260e5b47d3344d3ced7596e#readContract) through `UNISWAP_PAIR()`. Its `token0()` and `getReserves()` identified **523,188,110.711879 WISE** and **28,412.914470 WETH**.

`balanceOf(0x0000000000000000000000000000000000000000) / totalSupply()` on the LP token was **99.99732245%**. These LP shares are held at the zero address and cannot be redeemed by a wallet owner. The reserves still change with trading; ownerless liquidity is not a fixed dollar reserve or a guarantee of a sale price. The remaining LP supply is excluded from the ownerless calculation. [WISE's liquidity provisioning documentation](https://docs.wisetoken.net/wise-token/wise-ethereum/wise-contract-functionality/circulation-epoch/uniswap-provision).

USD estimates use the [Chainlink ETH/USD feed](https://etherscan.io/address/0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419#readContract): **$2,225.25388638 per ETH**, updated at **03:35:35 UTC**. WISE is valued at the pair's reserve ratio, **$0.1208474487**, rather than a separate price feed.

- Both sides of the pool: `2 × WETH reserve × ETH/USD` = **$126,451,896.70**.
- Ownerless portion: pool value × burned LP share = **$126,448,510.88**.
- All WISE staked: staked principal × implied WISE/USD = **$8,242,584.27**.
- Signature staked principal: **$2,583,265.16**; Signature plus Advanced: **$3,453,759.55**.

These are spot valuations, not amounts that could all be sold at that price. They are a dated Ethereum ecosystem snapshot; they are not aggregated with lending or RWA vault TVL.

## Reproduce

POST the following GraphQL query to the [WISE token subgraph](https://api.studio.thegraph.com/query/2012/wise-token/v0.1.2). The two addresses are the [Signature](https://etherscan.io/address/0x48791dbdfb38baa58e48329148c321bf33b3c1e1) and [Advanced](https://etherscan.io/address/0xf863a603501fcd30f56dffcb6700a25effefbe94) contracts:

```graphql
{
  _meta(block: { number: 26353342 }) {
    block { number }
    hasIndexingErrors
  }
  dailyGlobals(block: { number: 26353342 }, first: 1, orderBy: day, orderDirection: desc) {
    day
    totalStaked
  }
  stakers(block: { number: 26353342 }, where: { id_in: [
    "0x48791dbdfb38baa58e48329148c321bf33b3c1e1",
    "0xf863a603501fcd30f56dffcb6700a25effefbe94"
  ] }) {
    id
    totalStaked
    activeStakeCount
  }
}
```

Historical `_meta` queries may return a null timestamp; use the Ethereum block timestamp recorded above. At the same Ethereum block, read WISE `globals()` and `UNISWAP_PAIR()`; pair `token0()`, `getReserves()`, `totalSupply()` and zero-address `balanceOf()`; and Chainlink `decimals()` and `latestRoundData()`. WISE, WETH and LP amounts use 18 decimals; the USD feed uses 8. Archive-capable RPC access is needed for historical reads. To refresh, first obtain the indexer's current block and use that block consistently for every read.
