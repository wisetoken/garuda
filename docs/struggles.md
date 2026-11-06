# Integration struggles

## 6 November 2026 — Arkiv anonymous RPC query limits

**What failed.** During local marketplace testing, the Arkiv discovery view displayed zero listings and bids with a generic “Could not refresh the market” error. The market configuration endpoint remained healthy, but the Arkiv-backed sales endpoint returned HTTP 503. A direct server-side diagnostic identified the upstream failure: `arkiv_query` returned HTTP **429**, with `ANON_COST_LIMITED`. A basic `eth_chainId` call still succeeded. Reducing the query limit from 25 entities to 5 also failed, so a healthy chain-ID response did not establish that discovery was usable.

**Impact and evidence.** This was a discovery failure, not evidence of deleted orders. The service catalog returned eight stored orders during the incident. Arkiv subsequently responded again, and the browser displayed four listings and two bids with “Use cache” off. These are observations from that session, not an availability guarantee or a claim that every stored order was executable.

**Credential finding.** We checked local configuration without displaying credentials. The publisher private key in `garuda-full` matched the original `garuda/yoda` configuration. Neither local environment file contained `ARKIV_ACCESS_KEY`. The publisher key signs storage transactions; it does not authenticate RPC requests for access-key quotas. The SDK was therefore using the anonymous public endpoint.

**Changes made.** The server now maps upstream HTTP 429 to an explicit Arkiv rate-limit error. The client provides a “Load order catalog” action, stops interval polling after an order-book failure, avoids immediate retries for rate-limit errors, shows unknown counts instead of misleading zeroes, and avoids a successful-load toast when discovery failed. The source change is explicit; catalog results are not presented as Arkiv results. TypeScript checking and all 40 Arkiv tests passed, including a regression test for upstream throttling. The local API was restarted and recovery was verified in the browser.

**Remaining setup.** Generate a Rabdi RPC access key in the [Arkiv Hub](https://hub.arkiv.network/access-keys), set `ARKIV_ACCESS_KEY` in the server's untracked `.env.local` (and separately in the deployment's secret configuration), then restart the API. The existing runtime passes this variable to `rabdi({ accessKey })`. Do not substitute the publisher private key, put either secret in client code, or commit credentials. Verify an actual discovery query after configuration; a chain-ID call alone is insufficient.

**Limits and CROPS trade-off.** A keyed RPC has a quota too; it reduces exposure to anonymous limits but does not eliminate RPC dependence. The server operator manages that credential, and the RPC provider can associate requests with it. “Anonymous” in this error means unauthenticated RPC quota usage, not private network traffic. Catalog fallback still depends on Garuda's API. The standalone backup provides a separate recovery path, subject to its documented network and wallet assumptions.

Reference: [Arkiv access-key documentation](https://docs.arkiv.network/start-here/access-keys/). No access key was generated or configured during this investigation; recovery occurred while the public endpoint was still in use.
