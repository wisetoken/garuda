# WiseOne | Garuda Extension

A WiseOne NFT stake marketplace with planned stake-backed lending.

## Development

Use Node.js 22.12 or newer and npm. Run `npm install`, copy `.env.example` to `.env.local`, and set a public Thirdweb client ID for your app origin. `npm run dev` serves the app at http://127.0.0.1:3211/garuda/.

My stakes reads the connected wallet's Signature and Advanced NFTs from Ethereum. The cards and table show principal, maturity, available interest, historical annualized yield, and indexed creation transactions. Wallet connection supports external wallets; switching accounts refreshes the portfolio.

The local development and preview servers forward `/api` to `GARUDA_API_ORIGIN` (default http://127.0.0.1:3202). The service supplies WISE pricing, the stake indexer, and the signed-order market API (`/api/blend`, with `/advanced` for Advanced stakes). This repository currently contains the frontend; the API must be running separately. Ethereum reads use public RPC endpoints, or `VITE_MAINNET_RPC_URL` if configured. Browser configuration is public: never use private keys or private API credentials in `VITE_` variables.

## Checks and preview

Run `npm test`, `npm run typecheck`, and `npm run build`. `npm run preview -- --port 3212` serves the production build locally. A production host must route `/api` to a Garuda API; Vite's development proxy is not included in the static build.

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
anvil --fork-url https://ethereum-rpc.publicnode.com --fork-block-number 26351676 --chain-id 31337 --host 127.0.0.1 --port 18749 --silent
```

Then run `npm run test:market:fork`. An archive-capable Ethereum RPC may be substituted in the Anvil command. The test accepts only a loopback Anvil endpoint on chain 31337 and uses newly generated test accounts, never a browser wallet. `GARUDA_FORK_RPC` can select a different loopback port. Stop the disposable fork when finished.

The test uses the deployed Signature validator and Seaport contracts to buy and accept bids on active and matured stakes. It checks exact buyer debits, seller proceeds, fees, NFT ownership, preserved stake state, and rejection of replayed, cancelled, expired, unfunded, and wrong-owner fills. It also exercises the browser's Thirdweb-to-viem adapter. All fork changes are reverted afterward. Order publication uses an isolated in-memory catalog with fresh chain validation; this test does not publish orders to, or validate persistence in, the production API.
