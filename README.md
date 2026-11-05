# WiseOne | Garuda Extension

A WiseOne NFT stake marketplace with planned stake-backed lending.

## Development

Use Node.js 22.12 or newer and npm. Run `npm ci`, copy `.env.example` to `.env.local`, and set a public Thirdweb client ID for your app origin. `npm run dev` serves the app at http://127.0.0.1:3211/garuda/.

My stakes reads the connected wallet's Signature and Advanced NFTs from Ethereum. The cards and table show principal, maturity, available interest, historical annualized yield, and indexed creation transactions. Wallet connection supports external wallets; switching accounts refreshes the portfolio.

The local development and preview servers forward `/api` to `GARUDA_API_ORIGIN` (default http://127.0.0.1:3202). The service supplies WISE pricing and the stake indexer. Ethereum reads use public RPC endpoints, or `VITE_MAINNET_RPC_URL` if configured. Browser configuration is public: never use private keys or private API credentials in `VITE_` variables.

## Checks and preview

Run `npm run typecheck` or `npm run build`. `npm run preview -- --port 3212` serves the production build locally. A production host must route `/api` to a Garuda API; Vite's development proxy is not included in the static build.

## App structure

`src/components` contains the shared shell and stake cards. `src/pages` contains the feature screens. `src/lib` contains wallet integration and Ethereum readers. The app uses `/garuda/?screen=trade` for Market and `/garuda/?screen=stakes` for My stakes. The standalone concept at `/` is separate from the app.

Market, lending, funding, and informational screens are being developed independently. No transactions are initiated just by connecting a wallet or viewing stakes.
