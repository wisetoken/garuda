# Independent backup access

The lead property is access to existing positions and permissions without Garuda's application infrastructure. The ordinary order book remains a service; this release does not claim an independently operating marketplace.

## Build and inspect

```sh
npm ci
npm run build:backup
shasum -a 256 public/garuda-backup.html
cat public/garuda-backup.sha256
```

The build uses pinned esbuild, the committed dependency lock, and local source only. It embeds JavaScript and CSS in one HTML file. A CSP permits only the script's hash, inline styles, and HTTPS/local RPC connections. No remote script, font, stylesheet, analytics, wallet SDK, or application API is needed. The build rejects accidental Thirdweb, Arkiv SDK, and server imports. Optional discovery uses a small read-only implementation of Arkiv’s JSON-RPC protocol; the bundle has no Arkiv publisher or wallet client. The order importer never accepts a new contract address, ABI, executable script, RPC URL, or configuration from a backup file.

The self-contained file can be served from any local folder or compatible static host. It must be saved or otherwise obtained independently before the original host becomes unavailable. This implementation supplies a portable artifact; it does not establish long-term hosting availability. Release hashes need an independently trusted source, and a downloaded file must be checked before opening it with a wallet.

## Supported operations and boundaries

| Operation | Preflight | Evidence of success |
| --- | --- | --- |
| Cancel imported or recovered Signature order | Version/deployment/account/shape validation; Seaport code hash; wallet identity; simulation | Successful receipt and `getOrderStatus(hash).isCancelled` |
| Invalidate current Seaport counter | Current counter; pinned Seaport; wallet identity; simulation | Successful receipt and increased counter |
| Remove WISE allowance | Pinned WISE/Seaport; wallet identity; simulation | Allowance is zero at receipt block |
| Remove Signature collection permission | Pinned collection/Seaport; wallet identity; simulation | Operator permission is false at receipt block |
| Clear Signature NFT approval | Pinned collection; current owner; simulation | Approved address is zero at receipt block |
| Redeem matured Signature NFT | Fresh contract-derived owner, stake identity, active stake state and maturity; code hashes; simulation | Successful receipt with NFT burn and WISE transfers to the owner |

Mainnet actions wait for two confirmations. Wrong networks, changed wallets, substituted code, and early ending are rejected. A reorg is still possible after confirmation. RPC answers are not verified by a light client. Imported orders are used only for cancellation; the importer does not publish or execute them. A counter invalidation applies across applications using that Seaport deployment. Revocation alone does not invalidate signed orders, and an operator permission can coexist with an individual NFT approval.

The tool never receives keys. It needs an external wallet that supports EIP-1193/EIP-6963 and the connected account's normal signing authority. It does not recover a seed, operate an embedded wallet, or guarantee availability of the wallet's vendor. When a transaction hash is known, it is retained locally and new actions are blocked until resolution. If a wallet times out before returning a hash, inspect its activity before another submission. Replacements observed during receipt waiting update the tracked hash; a replacement after reload may require checking the wallet manually.

## Direct Arkiv recovery

Choose **Find my published orders** to query the public Rabdi RPC, or provide your own Rabdi endpoint. Nothing queries Arkiv on page load. No Garuda API, PostgreSQL database, application configuration endpoint, or publisher private key is required. The selected Arkiv RPC sees the source IP and wallet filter. Custom endpoint URLs remain in memory; requests omit cookies and referrers. The protocol reader rejects responses above 1.5 MB and times out after 15 seconds.

The tool selects the pinned publisher (`0x8d5b491D2c843F6B996De1EC66269809138cA60A`), Signature deployment scope, and `wiseone.garuda.orders.v1`/`v2` schemas. It checks typed metadata against signed terms, canonical hashes, publisher, entity expiry and wallet relationship. It verifies EOA signatures locally or ERC-1271 signatures against Ethereum at the checked block. Ethereum code hashes, order hashes, counter, filled/cancelled state and signed expiry are read at the same block. A failure to verify is reported and cannot produce a cancellation button or exported record.

Your own listings and bids can be exported as the same portable format or cancelled. Incoming bids are read-only and cannot be exported as your own orders. They name the original stake owner; ownership may have since changed. Duplicate v1/v2 signatures are suppressed; distinct signatures for the same hash are checked before UI deduplication so a forged variant cannot hide a valid one. Search reads up to two pages of 25 records per schema; partial failures, truncated searches and invalid records are visible. Pages observe current blocks and can shift with writes.

This is recovery from published records, not a complete inventory or autonomous trading engine. The publisher can censor new records or delete existing ones. Expired, unpublished or RPC-omitted records cannot be discovered. The original database publication anchor and transfer history are still required by ordinary settlement checks; Arkiv snapshot block fields do not substitute for those anchors. The UI therefore says **trade eligibility unchecked**, even when the signature is valid and the order is uncancelled. Saved-file cancellation and broad current-counter invalidation remain available without Arkiv.

### Retention is not trading validity

The installed `@arkiv-network/sdk` 1.0.1 and [current expiration documentation](https://docs.arkiv.network/writing/expiration/) allow `ExpirationTime.max()` for 7,884,000 blocks (about 182 days) and renewal before expiry. There is no `permanent()` method in this SDK. An unlimited encoded integer is not an unlimited allowed lifetime. Current market publication expires records at their signed deadline; this change does not extend or renew them. Longer archival retention could preserve history, but never extend the signed trading deadline. A funded renewer would introduce another availability dependency; a local export is the independent copy supplied here.

## Automated verification

```sh
npm test
npm run build
```

The backup tests cover portable import validation, network/wallet/code rejection, safe RPC URL handling, deterministic same-environment builds, absence of remote asset dependencies, and the SDK telemetry build boundary. Arkiv recovery tests cover hostile/mismatched records, forgery and wrong-domain signatures, contract signatures, current Ethereum status, v1/v2 deduplication, query limits, partial failures and request privacy. Existing marketplace tests remain part of the suite.

For real contract execution without real funds, start a disposable Anvil fork:

```sh
anvil --fork-url https://ethereum-rpc.publicnode.com --chain-id 31337 --host 127.0.0.1 --port 18760 --no-storage-caching
```

Then run:

```sh
GARUDA_FORK_RPC=http://127.0.0.1:18760 npm run test:backup:fork
```

The test verifies Anvil and chain 31337 before mutations, funds synthetic accounts only on the fork, and restores its snapshot afterward. It permits HTTP calls only to that loopback fork during the recovery flow. No Garuda API, live Arkiv, pricing service, or indexer is started. A synthetic Arkiv wire response carries fork-signed orders through the real recovery parser and Ethereum verifier before export/import and cancellation; fork signatures are never published. It proves an order can settle before cancellation and reverts afterward, checks counter invalidation and all three permission removals, rejects non-mature redemption, and verifies that a matured NFT burns while WISE reaches its owner. Test signatures and transaction hashes are fork-only evidence.

The fixture uses deployed Signature NFTs #20 and #53 and selects one already matured. It creates a new short stake on the fork for the early-ending rejection test. If upstream ownership/state changes, the fixture may need updating. A public RPC's historical-state availability and rate limits can cause fork timeouts; these are not evidence of a successful redemption. Do not use a mainnet endpoint as `GARUDA_FORK_RPC`.

### Verified on 6 November 2026

The unit suite passed 96 tests, TypeScript checking passed, and the production build passed. The self-contained page and in-app CROPS page rendered in the browser without console errors; custom Ethereum and Arkiv RPC selection worked and transaction/recovery controls stayed disabled without a wallet. The updated discovery section rendered without console errors. That browser did not have a wallet extension, so it did not test wallet popups.

The extended fork run passed with non-fork application HTTP requests rejected, including recovery of an Arkiv-format order, verification, cancellation, and a fresh cancelled-status read. The selected matured fixture was Signature #20. The redemption receipt recorded `10005830589267733449` base units (`10.005830589267733449` WISE) received by the synthetic owner, matched by its balance increase, and the NFT disappeared from ownership and inventory. The fork-only transaction hash was `0x4028273b0080ff3959f06607df76041b15ff83af8f194bcfc9d4422d339ab207`; it is not a mainnet transaction or public explorer proof. The test also established executable orders before individual/counter cancellation and rejected settlement afterward, and checked zero allowances/permissions after revocation. The fork snapshot was restored.

The read-only live check (`node --import tsx scripts/verify-backup-arkiv.mjs`, optionally followed by a wallet address) recovered an existing v2 Signature listing and incoming bid through the public, unauthenticated Rabdi RPC. Both maker signatures and Ethereum order status passed at block `26352952`. The hashes were `0x2a33b8001857cec5a80157b059c253ebc8976cc4b23ac17d5042f297bae2a2af` and `0x18586ba98d88035c4c443ea782cc4fb2ce406b573a43f05e42f2166ffcc5a350`. This check used no Garuda API, database, wallet, or transaction submission. These records will eventually expire, so a future smoke check may need another published order. An initial smoke-test selector picked a stake-cache record; restricting it to the order schema corrected that check.

An earlier test attempt stalled while advancing a long-lived fixture far into the future and was discarded. The successful run used an already-matured NFT and a freshly minted non-mature stake; it did not need a future clock jump. These checks establish local execution evidence, not an audit, public deployment, or completed submission video.

## Three-minute before/after demonstration

| Time | Screen/action |
| --- | --- |
| 0:00–0:30 | Establish the actual accepted baseline and show which capability is new. Acknowledge the earlier counter/Nym prototype. |
| 0:30–0:50 | Block Garuda's domain/API and the primary application RPC. Show the hosted flow failing. |
| 0:50–1:20 | Open the saved backup from another local origin with fresh storage. Connect an external wallet and select a working read RPC. |
| 1:20–2:15 | Find a published order directly on Arkiv, show verified maker/current Ethereum status, and cancel it. Show the wallet review and receipt. |
| 2:15–2:40 | Show the old order failing to settle. Export a portable copy and show that file import/counter cancellation also remain available when Arkiv fails. |
| 2:40–3:00 | Show the public source, build command, and remaining wallet/RPC/gas dependencies. |

Clearly label a fork demonstration throughout; do not present it as mainnet execution. Browser layout checks without a wallet extension do not establish wallet-interaction UX. A real browser-wallet rehearsal and the actual recording remain submission work tracked in beads. Continuity acceptance, the eligible baseline, public repo visibility, and independent mirror publication must be verified separately.
