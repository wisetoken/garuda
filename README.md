# WiseOne | Garuda Extension

A WiseOne NFT stake marketplace with planned stake-backed lending.

## Development

Use Node.js 22.12 or newer and npm. Run `npm install`, copy `.env.example` to `.env.local`, and set a public Thirdweb client ID for your app origin. `npm run dev` serves the app at http://127.0.0.1:3211/garuda/.

My stakes reads the connected wallet's Signature and Advanced NFTs from Ethereum. The cards and table show principal, maturity, available interest, historical annualized yield, and indexed creation transactions. Wallet connection supports external wallets; switching accounts refreshes the portfolio.

Run `npm run server` in a second terminal for the Garuda market API. It requires PostgreSQL, a server-side Ethereum RPC, and the deployment manifest configured in `.env.local`; it creates its tables on startup. Development and preview forward `/api/garuda` to `GARUDA_MARKET_API_ORIGIN` (default http://127.0.0.1:3213). Other `/api` requests still go to `GARUDA_API_ORIGIN` (default http://127.0.0.1:3202) for pricing and stake indexing. Advanced routes use `/api/garuda/advanced`. Ethereum reads use public RPC endpoints, or `VITE_MAINNET_RPC_URL` if configured. Browser configuration is public: never use private keys or private API credentials in `VITE_` variables.

## Checks and preview

Run `npm test`, `npm run typecheck`, and `npm run build`. `npm run preview -- --port 3212` serves the production build locally. A production host must route `/api/garuda` to this market service and other `/api` requests to the pricing/indexing service; Vite's development proxy is not included in the static build.

## App structure

`src/components` contains the shared shell and stake cards. `src/pages` contains the feature screens. `src/lib` contains wallet integration and Ethereum readers. The app uses `/garuda/?screen=trade` for Market and `/garuda/?screen=stakes` for My stakes. The standalone concept at `/` is separate from the app.

Market supports WISE sale listings, purchase bids, purchases, bid acceptance, and onchain order cancellation for collections with a verified, enabled sales deployment. Signature trading is currently configured; Advanced trading remains disabled until its validator is configured. Listing opens a review of the asking price, expiry, fee, and seller proceeds. Contract bindings, ownership, stake state, wallet account, network, and current order availability are checked before signing or settlement. Signed orders are saved on the device before publication so a failed API response does not lose cancellation access.

Table is the default market view; Cards, search, inactive orders, purchase bids, and the connected wallet's orders are also available. No transactions are initiated just by connecting a wallet or viewing stakes. Each approval, signature, purchase, or cancellation needs wallet confirmation. Lending and funding are separate upcoming steps.

## Stake transfers

A sale listing requires approval of the selected NFT and a signed Seaport order. A buyer approves the exact WISE amount if needed, then confirms the purchase. A purchase bid instead requires the bidder's WISE approval and signature; the stake owner reviews the net proceeds, approves the selected NFT if needed, and accepts. The owner does not need WISE to accept a bid.

Settlement exchanges full NFT ownership and WISE in one transaction, deducting the configured marketplace fee from the seller's proceeds. It preserves the underlying stake's principal, shares, and maturity. Signing or publishing an order alone does not transfer the stake. Bids are not escrowed and remain subject to the bidder's balance, allowance, expiry, cancellation, and the committed stake state.

Connecting from a trade review preserves its price and duration. Published bids open the Purchase bids tab (`book=bids`). Successful trades refresh the order book, ownership, balances, and stake details. The app only reports settlement success after the matching Seaport fulfillment and validator event are confirmed.

## Ethereum fork verification

With Foundry's `anvil` installed, run a disposable Ethereum fork in a separate terminal:

```sh
anvil --fork-url https://ethereum-rpc.publicnode.com --chain-id 31337 --host 127.0.0.1 --port 18749 --silent
```

Then run `npm run test:market:fork`. An archive-capable Ethereum RPC may be substituted in the Anvil command. The test accepts only a loopback Anvil endpoint on chain 31337 and uses newly generated test accounts, never a browser wallet. `GARUDA_FORK_RPC` can select a different loopback port. Stop the disposable fork when finished.

The public RPC may reject historical state after the fork ages. Restart at the latest block or use an archive-capable provider if that happens.

The test uses the deployed Signature validator and Seaport contracts to buy and accept bids on active and matured stakes. It checks exact buyer debits, seller proceeds, fees, NFT ownership, preserved stake state, and rejection of replayed, cancelled, expired, unfunded, and wrong-owner fills. It also exercises the browser's Thirdweb-to-viem adapter. All fork changes are reverted afterward. Order publication uses an isolated in-memory catalog with fresh chain validation; this test does not publish orders to, or validate persistence in, the production API.

For the HTTP API and durable storage checks, create an empty local PostgreSQL database with `createdb garuda_test`, keep the disposable fork running, and run `npm run test:market:api`. `GARUDA_TEST_DATABASE` can select an existing local database; the test uses its own temporary schema and removes it afterward. It publishes listings and bids through the Garuda route handlers, reconnects the database to verify persistence and the Arkiv queue, settles both order kinds on the fork, and verifies their indexed status becomes sold. It never publishes the test orders to Arkiv.

## Arkiv discovery

The Market defaults to **Arkiv** discovery, with an explicit **All orders** catalog option. Both sale listings and purchase bids are published automatically after their signed orders are accepted. A durable PostgreSQL queue retries failures; publisher locking and order-hash lookup prevent duplicate publications. The app displays pending publication and links published orders to their Arkiv entities. An Arkiv outage is reported as an outage, rather than silently relabeling database results.

Order entities use `wiseone.garuda.orders.v1` on [Rabdi](https://docs.arkiv.network/), chain **7794095**, with expiration tied to each signed deadline. Stake display snapshots use `wiseone.garuda.stakes.v1`, expire after 15 minutes, and are accepted as a cache hit for at most five minutes with canonical Ethereum block provenance. Ethereum remains authoritative for ownership, approvals, cancellation and settlement. The market database retains the original publication block needed to reject signatures after a transfer away and back.

The entity writer is **`0x8d5b491D2c843F6B996De1EC66269809138cA60A`**. This dedicated server publisher owns the Arkiv entities; the Ethereum maker and stake owner are separate indexed fields. Configure a funded testnet publisher and `ARKIV_ACCESS_KEY` on the server to enable writes. Never put its private key in browser variables or commit it. Without a writer, discovery can still read the configured publisher. Switching the publisher address also changes the entity set the app trusts.

These read-only commands query live Arkiv data without loading a signer:

```sh
npm run arkiv:query
npm run arkiv:query -- listing
npm run arkiv:query -- bid
```

The query filters the Garuda schema, publisher, deployment scope, unexpired deadlines and optional order kind. It returns entity keys and order hashes. The query will naturally return fewer results after orders expire. [Schema and runnable explorer query](arkiv/schema.md), [live evidence](arkiv/evidence.md), [design rationale](arkiv/why-arkiv.md), [user-facing behavior](arkiv/how-you-use-arkiv.md), [reach](arkiv/reach.md), and [integration feedback](arkiv/friction.md) document the implementation.

## Continuity scope and AI assistance

The existing product had WISE NFT stake portfolios, Seaport listings and bids, Ethereum settlement checks, and an Arkiv proof of concept with manual order publication and stake snapshots under `wiseone.yoda`. Those capabilities are the baseline, not new work claimed for this change.

The work in this change adds the Garuda schemas and market API, automatic durable publication for listings and bids, retry/deduplication handling, explicit default Arkiv discovery in the Market, entity links, validation tests and the evidence documents. Existing public signed orders were used for Rabdi integration checks. No new mainnet orders or transfers were executed during those checks.

ETHGlobal Continuity acceptance and the event's eligible work window must be confirmed by the team. Repository timestamps alone do not establish eligibility. The project is released under the [MIT License](LICENSE). This does not by itself establish event eligibility.

OpenAI Codex assisted with implementation, refactoring, tests, documentation and local verification. The project owner directs the work and reviews changes. See [the implementation plan](history/PLAN.md) for the design sequence.
