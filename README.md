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

Market supports WISE sale listings, purchase bids, purchases, bid acceptance, and onchain order cancellation for Signature and Advanced stakes. Listing opens a review of the asking price, expiry, fee, and seller proceeds. Contract bindings, ownership, stake state, wallet account, network, and current order availability are checked before signing or settlement. Signed orders are saved on the device before publication so a failed API response does not lose cancellation access.

Table is the default market view; Cards, search, inactive orders, purchase bids, and the connected wallet's orders are also available. No transactions are initiated just by connecting a wallet or viewing stakes. Each approval, signature, purchase, or cancellation needs wallet confirmation. Lending, funding, and informational screens are separate upcoming steps.
