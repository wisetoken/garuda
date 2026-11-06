# Optional private Ethereum reads

Garuda integrates `@anon-rpc/browser-harness` **0.4.0** with the official [Nym worker](https://ethereum.github.io/anon-rpc/adopters/). It is off by default. Enable it in **CROPS → Private Ethereum reads**; **Test private connection** performs a mainnet chain check and block read without connecting a wallet. Testing alone does not change the app's selected read mode.

This adds IP separation for covered RPC reads: the destination RPC receives them through a Nym exit router. It still sees wallet addresses, calldata and other requested data. It is not anonymous transactions, an anonymous marketplace or a server that learns nothing.

## What changes for users

| Path | With private app reads selected |
| --- | --- |
| Signature/Advanced portfolio reads through the shared Ethereum client | Nym |
| Funding balances, Uniswap quotes, onchain price feed reads and client-side market checks using that client | Nym |
| ENS contract reads | Nym; automatic offchain CCIP reads are disabled rather than bypassing the private route |
| Wallet discovery, account connection, embedded wallets, signing and transaction submission | Wallet/provider path; not covered by this switch |
| Garuda API, Arkiv discovery, indexers and pricing API | Existing direct paths; not covered |
| ENS avatars, NFT/media gateways and other images | Existing direct paths; not covered |
| Downloaded standalone backup HTML | Its own direct wallet/RPC selection; independent of this setting |

The mode is fixed for a page's lifetime. Changing it saves the choice and reloads that page, discarding in-memory query results and old clients. Other open Garuda tabs must be reloaded to adopt the change. This does not erase traffic already sent in direct mode or affect another website or wallet extension.

The header indicates when private reads are selected or unavailable. A failure stops covered reads; the direct-provider failover loop is not used. Retry explicitly from CROPS, or explicitly switch back to direct reads. An EVM revert remains a failed contract call rather than a transport change. The worker is lazy-loaded, so opening the app with private mode off makes no Nym startup requests.

## Request path and trust

The specifier is `0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0` on Ethereum mainnet. It is the Nym worker, not Anon-RPC's non-private passthrough example. The fixed destination and bootstrap RPC is `https://ethereum-rpc.publicnode.com`; there are no provider credentials in this route.

Startup uses direct RPC only for `eth_chainId` and the specifier's exact `workerHash()` and `workerResolvers()` calls. The bootstrap wrapper rejects wallet queries, other contracts/selectors and calls with extra fields such as `from`. Those startup reads reveal use of the public specifier, not the account being inspected. Download hosts see the user's IP when the harness fetches the roughly 18 MB worker bundle.

The harness checks the bundle against its onchain hash and runs it inside a Web Worker in a null-origin sandboxed iframe. The network worker does not receive wallet keys, DOM access or host cookies. It does receive all reads routed through it and may keep network state in its namespaced IndexedDB storage. A malicious bootstrap RPC or specifier owner can affect which code is trusted; the sandbox does not make RPC responses independently proven. See the official [integration and trust model](https://ethereum.github.io/anon-rpc/wallets/).

The app accepts only an explicit set of read methods. Signing, wallet-management and transaction-submission methods are rejected before worker creation. It verifies mainnet through the worker before sending account-specific reads, checks JSON-RPC IDs/results and response size, and preserves contract-revert codes without displaying arbitrary provider messages. Requests omit credentials/referrers and disallow redirects. Startup has a two-minute deadline; individual reads have a one-minute deadline. Cancellation/reset invalidates stale in-flight results. Failures require an explicit reset before another startup attempt.

Sources: [private session and bootstrap](../src/lib/private-rpc.ts), [transport selection](../src/lib/rpc-failover.ts), [read client/CCIP policy](../src/lib/wise-stake-start-tx.ts), [CROPS controls](../src/components/PrivateReadControls.tsx).

## What is new for Continuity

The earlier WiseOne/yoda prototype already contained an Anon-RPC/Nym experiment. This repository now integrates the route with its shared read client and adds restricted bootstrap traffic, explicit lifecycle/reset, fail-closed routing, checked responses, visible connection controls and scoped privacy disclosures. Describe that integration and hardening as new work; do not present the underlying networks or prior prototype as newly invented during the event.

The independent backup remains the lead censorship-resistance feature. Optional private app reads add a separate privacy benefit when the network is available. EF tooling is optional under the supplied prize criteria, and its inclusion does not guarantee additional points or qualification.

## Verification and demo

Run `node --import tsx --test scripts/test-private-rpc.mjs`. These deterministic tests cover the restricted bootstrap, shared worker, forbidden methods, chain verification, timeout/reset behavior, error and size checks, and the actual app transport's refusal to leak balance reads to direct fallbacks. They use simulated network responses and do not by themselves establish live Nym availability or end-to-end anonymity.

On 6 November 2026, the isolated commit candidate passed all 150 tests, including the 10 new privacy tests, plus typecheck and the production build. The browser check verified the experimental controls, mode persistence/reload, header indicator and restoration to off. The standalone backup build remains unchanged and retains its strict CSP.

**Live result: not yet verified end to end.** Garuda's private test returned failure without a direct fallback. The public bootstrap resolved mainnet and worker hash `0xf13a448a8721b9d0b20da3d5b80ffe00bf4c5bb3aae812a38d3d1e3bc81fceb8`. In the same in-app browser, the [official Nym demo](https://ethereum.github.io/anon-rpc/demo/?worker=nym) also failed: its log showed a tunnel setup timeout, worker readiness after about 131 seconds, then repeated `eth_getBalance` timeouts after roughly 24–36 seconds. Its sample address and default PublicNode destination were used, with no user wallet connected. Public directory queries returned 60 mixnodes and 630 gateways, which does not establish that a complete route was usable.

This comparison reproduces the symptom outside Garuda; it does not prove a global Nym outage or isolate the cause among browser, network, gateway/exit and destination RPC. The Nym worker's [own limitations](https://github.com/nymtech/anon-rpc-worker#limitations) also note unconfirmed Safari support. Keep the feature experimental and off by default until a supported-browser live read and a covered portfolio flow can be recorded successfully. No successful live private-read or privacy-prize qualification is claimed from these checks.

For a live demo, open CROPS and test the connection without a wallet. After a successful block read, enable private app reads, then load a known public portfolio and show the selected route. Inspect browser network requests: ordinary bootstrap/specifier and worker downloads are expected; account-specific JSON-RPC requests for the covered client must not go directly to the destination RPC. Stop the private route and show a failure without direct fallback. Wallet traffic, APIs, images and previously sent requests are outside that demonstration's claim.

Nym and this draft harness are additional availability/trust dependencies. Slow startup or a worker/RPC outage must be reported as a failed test, not as a verified private read. Keep the direct standalone recovery artifact available independently of this optional feature.
