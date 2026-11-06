# Uniswap integration feedback

Garuda lets buyers acquire existing WiseOne NFT stakes, with offers priced in WISE, WETH or USDC. We integrated Uniswap v2 into a single purchase action: choose ETH, WETH, USDC or WISE and buy the stake, while the seller receives the currency in their signed listing. The [stake validator and atomic payment router](README.md#ethereum-contracts) are deployed on Ethereum mainnet, verified on Etherscan and Sourcify, and the marketplace is active.

## What worked

Router02's `getAmountsIn` and exact-output swaps let us quote a fixed marketplace obligation and cap the input spent. Our router obtains exactly the listing currency, settles Seaport, delivers the NFT and refunds unused payment in one transaction. Native ETH and ERC-20 paths use the same purchase flow.

All nine atomic payment routes passed against real Ethereum contracts on a disposable fork at block 26,356,017: eight Uniswap routes plus direct ETH → WETH wrapping. WISE, WETH and USDC were each tested as settlement currencies. We also verified 12 direct marketplace settlements and an actual reverted router transaction for a cancelled order. See the [results](contracts/seaport/deployments/fork-verification.json), [fork runner](scripts/verify-seaport-v2-fork.mjs) and [integration details](README.md#uniswap-integration).

A real Ethereum purchase confirmed the complete flow: **2.420128 USDC → WETH → 20 WISE**, **19.9 WISE** to the seller, **0.1 WISE** in marketplace fees, Signature Stake **#20** delivered to the buyer, and **0.011204 USDC** refunded. The swap, purchase and refund all appear in [one successful transaction](https://etherscan.io/tx/0x54a58a665321e511677005afe36bd78f0694f704684651911632bbf0885a13f4). See the [mainnet example and screenshot](README.md#mainnet-example-buy-a-wise-stake-with-usdc) and [receipt evidence](docs/uniswap-mainnet-purchase.json).

## What took extra work

**Paying a fixed obligation.** Our first flow used a buffered exact-input swap followed by a separate purchase. User testing made the problem clear: buyers wanted to pay in their own token, not manage a conversion first. We replaced it with a restricted exact-output router. An official example for “pay with token A, settle a fixed price in token B,” including maximum input, refunds and decimals, would help integrators.

**Approval time and quote expiry.** A quote may expire while a user reviews or confirms an ERC-20 approval. We retain the submitted approval hash, recheck the listing and quote before purchase, and avoid retrying a transaction with an unknown receipt. A reference flow covering approval rejection, slow confirmation, quote refresh and recovery would help.

**Atomic marketplace integration.** A listing can disappear while its prospective buyer is obtaining the payment token. Our router now reverts the swap if the purchase fails. Seaport's zone checks the fulfiller's NFT ownership, so the router receives the NFT and delivers it to the buyer within the same transaction. Guidance on composing exact-output swaps with marketplace recipients, callbacks, approvals and rollback would reduce custom integration work.

These are integration and UX observations; we did not identify a Uniswap protocol failure in the successful fork runs. This implementation uses the v2 contracts directly, so we are not reporting experience with the hosted Trading API, UniswapX or v4 hooks.

## Verification

Run `npm test` for quote, slippage, route, wallet-change, balance-change, expiry and receipt-recovery checks. The [README](README.md#uniswap-integration) includes local-fork commands, contract addresses and links to the implementation. No live funds were used for these tests.
