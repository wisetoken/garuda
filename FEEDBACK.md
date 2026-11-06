# Uniswap integration feedback

Garuda lets buyers acquire existing WiseOne NFT stakes. The live V1 market settles in WISE; our V2 integration supports WISE, WETH and USDC offers once the replacement validator is deployed. We integrated Uniswap v2 funding directly into the purchase review so buyers can obtain the missing payment token without leaving the flow.

## What worked

Router02's `getAmountsIn` and `getAmountsOut` let us calculate the input needed for a payment-token shortfall, then show a minimum output before asking for a transaction. The same router supports native ETH and ERC-20 inputs, including USDC → WETH → WISE. We reused our standalone Get WISE swap engine in the purchase modal.

All nine funding routes passed against Ethereum contracts on a disposable fork at block 26,355,909: eight Uniswap swaps and direct ETH → WETH wrapping. Native input took one transaction; ERC-20 input took an exact-input approval followed by a swap. WISE, WETH and USDC were each tested as the output token. See the [results](docs/uniswap-fork-verification.json), [fork runner](scripts/verify-purchase-funding-fork.mjs) and [integration details](README.md#uniswap-integration).

## What took extra work

**Funding a fixed obligation.** A quote for exactly the missing payment token can leave the wallet short once slippage is applied. We round the output target up before `getAmountsIn`, verify that the resulting minimum covers the shortfall, and reject a quote that moves below it. An official example for “obtain at least X tokens to complete another action,” comparing exact-output swaps with buffered exact-input swaps, would make this decision easier.

**Approval time and quote expiry.** The quote may expire while a user reviews or confirms an ERC-20 approval. We keep the submitted approval hash, require a fresh quote before the swap when needed, and avoid retrying a transaction whose receipt is still unknown. A reference flow covering approval rejection, slow confirmation, quote refresh and recovery would help integrators.

**The swap and purchase are separate.** A stake can sell while its prospective buyer is funding the payment. We recheck the listing before requesting the swap and again for the purchase, and explain that funding does not reserve it. An example combining a swap with an independent marketplace action would be useful, with clear guidance on which parts can be atomic and what happens when the second action fails.

These are integration and UX observations; we did not identify a Uniswap protocol failure in the successful fork runs. This implementation uses the v2 contracts directly, so we are not reporting experience with the hosted Trading API, UniswapX or v4 hooks.

## Verification

Run `npm test` for quote, slippage, route, wallet-change, balance-change, expiry and receipt-recovery checks. The [README](README.md#uniswap-integration) includes local-fork commands, contract addresses and links to the implementation. No live funds were used for these tests.
