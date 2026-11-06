# WiseOne | Garuda Extension implementation plan

This document describes Garuda's scope, implementation sequence, and design decisions. Issue status is tracked with beads; it is not duplicated here. Continue development in `Development/garuda-full`. Work stays on `master`, with small local commits, Codex co-authorship, no package-lock changes, and no push until requested. Source files stay below 500 lines.

## Current foundation

Garuda has wallet connection, live Signature and Advanced stake portfolios, and a Signature marketplace with listings, purchase bids, buying, bid acceptance, and onchain cancellation in WISE. Settlement verification on disposable Ethereum forks covers active and matured stakes, exact payments and fees, unchanged underlying stake terms, and rejection of stale or invalid orders. This evidence does not establish a public launch or completed security audit. Advanced trading remains disabled until a verified validator deployment is configured.

The Garuda API validates signed orders, persists them in PostgreSQL, and queues automatic Arkiv publication with retries and deduplication. Arkiv is the default discovery source, with an explicit All orders catalog and publication links. Garuda order and stake schemas are implemented, and Rabdi publication evidence is recorded in `arkiv/evidence.md`.

The interface includes the disconnected welcome screen, WiseOne wallet connection styling, consistent typography, header and footer branding, grouped token amounts, USD estimates, custom currency controls, and larger trade actions. Continue reviewing these as complete flows across desktop, mobile, and both themes. WISE is the supported settlement currency; a currency menu must not imply that other currencies are executable.

## Next: finish and verify the marketplace experience

Start with an end-to-end browser review of My stakes and Market: disconnected and connected states, stake cards and tables, listing and bid forms, duration and currency menus, review dialogs, wallet prompts, pending transactions, success, rejection, and recovery. Check spacing, focus, keyboard interaction, dropdown placement, and narrow screens together with data loading and error states.

Make transaction feedback clear throughout approval, signing, publication, and confirmation. Keep saved signed orders recoverable when publication fails. Refresh portfolio, order availability, and balances after completion, and prevent duplicate submissions while an action is pending. Preserve both direct purchases and accepted bids.

Use “Signature Stake #…” and “Advanced Stake #…” consistently in cards, reviews, order details, and accessible labels. Use the WiseOne teal logo for stake identity and the WISE token logo for currency. Contract collection names remain unchanged.

Complete this phase with unit tests, type checking, a production build, and browser verification. Repeat fork and API integration checks when settlement, validation, persistence, or transaction orchestration changes. User wallet actions remain necessary for real signatures and transactions.

## Market reliability and deployment readiness

Keep signed-order verification and the immutable original Ethereum publication block in the market database. Preserve existing orders and anchors: transfer-away-and-back protection must survive retries and Arkiv re-publication.

Exercise API restarts, unavailable RPCs, Arkiv outages, publication retries, expired orders, cancellation, ownership changes, and recovery. Show source failures explicitly; a database fallback must not be presented as an Arkiv result. Recheck current Ethereum availability before enabling a trade.

Review dependency advisories and supported updates before public deployment. Define the production app/API routing, PostgreSQL configuration, Ethereum RPC, dedicated publisher, and worker operation. The pricing and stake-indexing service is a separate dependency; document its availability and show unavailable estimates honestly. Keep publisher keys and private credentials server-side and out of git. Deployment is a separate action from local readiness work.

## Arkiv discovery and snapshot guarantees

Use `wiseone.garuda.orders.v1` for listings and purchase bids on Arkiv Rabdi, chain 7794095. Retain the signed envelope, deployment scope, order hash, kind, maker, stake owner, collection, token ID, expiry, and original publication anchor. A dedicated server publisher owns the entities; the Ethereum signature authenticates the maker.

Match entity expiration to the signed order deadline. Discovery expiration does not cancel a still-valid Ethereum signature. Persist publication requests with accepted orders, retry temporary failures with bounded backoff, deduplicate under a publisher lock, and read an entity back before reporting publication success.

Use `wiseone.garuda.stakes.v1` for short-lived display snapshots with owner and block provenance. Verify canonical block hashes and use fresh Ethereum reads before approvals or settlement. Cached balances, yield, and ownership are never authority to transfer a stake.

Maintain coverage for malformed entities, wrong publishers or deployment scopes, expiry, idempotent retries, reorgs, cancellation, and transfer-away-and-back protection. Keep actual entity keys, publisher details, and runnable queries in the Arkiv documentation. Separate live testnet evidence from isolated Ethereum fork tests and report only observed usage.

## Then: Get WISE

Build the funding and swap experience around acquiring WISE for marketplace use. Establish supported routes, quote freshness, slippage, fees, allowances, network checks, and transaction outcomes before enabling execution. Reuse the app's amount formatting, token presentation, and USD estimates. Keep broader marketplace settlement currencies as a separate contract and API decision.

## Then: stake-backed lending

Define borrower requests and stake-specific lender offers, including principal, duration, interest, fees, expiry, collateral custody, repayment, and default behavior. Establish how ownership and stake rights behave while collateral is committed. Implement and verify the contracts and settlement paths before enabling loan signatures or funding. Build the interface around those verified terms.

## Subsequent Garuda work

Add CROPS recovery tools and optional private Ethereum reads, with explicit provider behavior and failure states. Enable Advanced stake trading only after its validator configuration and collection-specific settlement checks are verified. Complete the homepage after the application flows are established.

Keep the README and integration documentation aligned with demonstrated behavior. Optional storage or ecosystem integrations should support a concrete Garuda user flow; they are not prerequisites for finishing the marketplace.
