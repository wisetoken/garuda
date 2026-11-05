# WiseOne | Garuda Extension

A WiseOne NFT stake marketplace with planned stake-backed lending.

The repository currently contains a static concept page and a minimal React, TypeScript, and Vite app shell. Market, My stakes, and Lend are placeholder screens with working navigation. There are no wallet connections, live positions, transactions, APIs, or smart-contract integrations yet.

## Development

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:3211/> for the concept page or <http://127.0.0.1:3211/garuda/> for the app. The separate port keeps the existing development app available.

## Checks and production preview

```sh
npm run typecheck
npm run build
npm run preview
```

Stop the development server before starting the production preview; both use port 3211. The build writes both HTML entry points and app assets to `dist/`.

## Structure

- `index.html`: the standalone project concept, also readable directly in a browser.
- `garuda/index.html`: the React app entry point.
- `src/main.tsx`: React and router setup.
- `src/App.tsx`: selects a screen from the URL.
- `src/components/`: the shared app shell and placeholder layout.
- `src/pages/`: separate Market, My stakes, and Lend screens.
- `src/styles.css`: the app's base styling.

The app defaults to Market. Direct links use `/garuda/?screen=trade`, `/garuda/?screen=stakes`, and `/garuda/?screen=lend`. Browser back and forward navigation are supported.

The shared app shell follows the existing WiseOne Garuda app: teal owl branding, seven navigation destinations, dark/light appearance, and an Ethereum footer. Feature pages remain placeholders until their integrations are migrated. The homepage is deferred.

My stakes now includes the migrated card presentation, a table view, and the introductory info tooltip. It currently uses explicitly labeled sample positions for design review; these are not connected wallet balances, and transaction buttons are disabled.
