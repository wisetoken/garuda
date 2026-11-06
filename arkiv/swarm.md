# Arkiv + Swarm bonus — WiseOne: Garuda

Garuda preserves the artwork users see for a WISE stake in Swarm and makes its references discoverable through Arkiv. A holder can retrieve the recorded artwork without WiseOne's original metadata host. The production **Artwork backup** viewer displays it, checks its checksum, lets the user choose a read gateway, and exports portable references.

This is our evidence for the [ETHGlobal Mumbai Arkiv + Swarm bonus for existing projects](https://ethglobal.com/events/mumbai/prizes/arkiv). The integration is live; **submission evidence is not yet complete**. The actual gateway postage batch ID, final demo video link/timestamp, and confirmed Continuity eligibility/event-start baseline have not been supplied. The zero batch placeholder below must not be presented as a funded batch ID.

## Before the event and new work

**Existing WiseOne:** WISE staking contracts and positions, portfolio/UI foundations, and the WiseOne/yoda artwork renderer. Artwork was served through the project's metadata service. We do not claim the renderer or staking protocol as new work.

**Added at Mumbai:** Garuda's marketplace and Arkiv order publication, plus a durable artwork-backup worker for accepted listings and bids. The worker renders a snapshot from verified Ethereum stake data, uploads SVG and JSON files to Swarm, verifies both downloads, publishes a linked Arkiv media entity, and reads that entity back before reporting success. New work also includes the user-facing viewer/export, gateway selection, retry handling, and recovery of existing Arkiv manifests after a fresh deployment. The NFT's original `tokenURI` is unchanged.

The implementation history starts with [603f9ba](https://github.com/wisetoken/garuda/commit/603f9ba) (6 November 2026), followed by live gateway integration and production manifest recovery in [dee20ac](https://github.com/wisetoken/garuda/commit/dee20ac) (7 November 2026), and [recorded production evidence](https://github.com/wisetoken/garuda/commit/96368c5). These identify this work; they do not establish the eligible pre-event WiseOne baseline or Continuity acceptance on their own.

The latest committed snapshot available in the local WiseOne foundation checkout is `3912461f3c2dea6cd59260c9add70c0976153dde` (28 October 2026). It is a **candidate baseline**, not a confirmed complete inventory: that checkout also contains uncommitted prototype work. The project owner must identify any reused work outside that commit and confirm the event-start scope. We do not treat a commit timestamp alone as eligibility approval.

## What lives where

| Location | Data and purpose |
| --- | --- |
| Swarm | A self-contained public SVG artwork snapshot and JSON metadata. The JSON contains `image: "bzz://<image-reference>/"`, the image SHA-256, NFT identity, order hash and observed Ethereum block details. |
| Arkiv orders | Signed listings and bids under `wiseone.garuda.orders.v2`; separate from the media entity. |
| Arkiv media | `wiseone.garuda.media.v1`, indexed by `scope`, `orderHash`, `collection`, `tokenId` and `renderer`. Its **`manifest` bytes field is UTF-8 JSON**. The Swarm references are **`manifest.image.reference`** and **`manifest.metadata.reference`** after JSON decoding. Corresponding `sha256` fields enable integrity checks. No Swarm feed is used. |
| Ethereum | Ownership, underlying stake state and settlement authority. The artwork is an observed snapshot, not a live balance or authorization to trade. |
| Garuda PostgreSQL | Queue state, retry progress and convenient cached receipts. After publication, the manifest and files can be read directly without this database or Garuda's API. |

Media entities are on **Arkiv Rabdi, chain ID 7794095**, owned by publisher **`0x8d5b491D2c843F6B996De1EC66269809138cA60A`**. This is the Arkiv writer, not a claimed Swarm postage purchaser. Media entities expire after **90 days**; automatic renewal is not implemented. That is independent of the signed offer's trading deadline and the stake's maturity. Swarm retention depends on postage and network availability; neither the public gateway nor this integration promises permanence.

## Open a real example: Signature Stake #53

| Evidence | Value |
| --- | --- |
| Ethereum NFT | Collection `0x48791DbDFB38bAA58e48329148C321bF33B3c1e1`, token `53` |
| Order hash | `0x54ad68637e3781e0fd8ff1a177911a4348ca32c6f1285eb42fda7b74cd9d5294` |
| Arkiv media entity | [`0xdb4995a90ca41235939cac4f14a54e89be1d97244ece56965f50202ef9c4f439`](https://rabdi.explorer.arkiv.network/entity/0xdb4995a90ca41235939cac4f14a54e89be1d97244ece56965f50202ef9c4f439) |
| `manifest.image.reference` | [`7b38bf6f2497909a0eb67d73e80eed04c9f729b63a7e846df20b59f7fa5eb9b1` — open SVG](https://api.gateway.ethswarm.org/bzz/7b38bf6f2497909a0eb67d73e80eed04c9f729b63a7e846df20b59f7fa5eb9b1/) |
| `manifest.metadata.reference` | [`ed9dbaa741588c32391aeb41ca10dd793c5ccf7b58a58c856d3842b87e0f390e` — open JSON](https://api.gateway.ethswarm.org/bzz/ed9dbaa741588c32391aeb41ca10dd793c5ccf7b58a58c856d3842b87e0f390e/) |
| Image SHA-256 | `725d2b46b366b7aa898aef0b8704f700e36e9ad828b98fc6e2cb85dc972bf75c` |
| Metadata SHA-256 | `c2b746b1b8d3988e82074babd85ef96c6e110fbb072e8f87a506491731475b7a` |
| Ethereum observation | Block `26358579`, hash `0x04ef51ead6cb18d3a0ad48cea3ba05af37d071e6b4d72468b17cb839a51dc051` |

The artwork shows Signature #0053, 1,000 WISE principal, a 365-day term and 16 October 2027 maturity. It is the recorded snapshot, not freshly calculated stake information. [Full evidence](../docs/swarm-live-evidence.json) also records a listing and a bid for #61. The first uploads ran through the local worker; production subsequently recovered those same manifests and reverified the files, rather than uploading them again.

Try [production Market](https://garuda.wise.one/market): open an order's menu → **Artwork backup** → **Load artwork**, then expand **Portable references**. Orders may stop appearing after expiry or cancellation; the direct references above remain usable while the Arkiv entity and Swarm files are retained. The [production status receipt for #53](https://garuda.wise.one/api/garuda/media/0x54ad68637e3781e0fd8ff1a177911a4348ca32c6f1285eb42fda7b74cd9d5294) is another convenient entry point, but the proof command below does not call it.

The dialog also links the same NFT to [OpenSea](https://opensea.io/item/ethereum/0x48791DbDFB38bAA58e48329148C321bF33B3c1e1/53) and [Etherscan](https://etherscan.io/nft/0x48791DbDFB38bAA58e48329148C321bF33B3c1e1/53). Those sites display their own view of the original NFT; they are not evidence that its `tokenURI` now points to Swarm.

## Upload service and postage provenance

| Item | Recorded configuration/evidence |
| --- | --- |
| Upload service | Swarm's [official public gateway](https://www.ethswarm.org/access/), API base `https://api.gateway.ethswarm.org`, `POST /bzz?name=…` |
| Mode | `SWARM_UPLOAD_MODE=public-gateway`; public, unencrypted small files; no private Bee authentication or pin request |
| Who supplies postage | The public gateway service supplies postage. We did not purchase or receive a privately managed batch. Its underlying Bee instance and purchasing wallet were not exposed to us. |
| Header sent by Garuda | `swarm-postage-batch-id: 0000000000000000000000000000000000000000000000000000000000000000` — **gateway placeholder only, not the actual funded batch** |
| Actual postage batch ID | **Not obtained. This required evidence is still missing.** Upload receipts returned references without the funded batch ID; `GET https://api.gateway.ethswarm.org/stamps` returned HTTP 404 on 7 November 2026. |

The gateway's [UI configuration](https://github.com/ethersphere/gateway-ui#environment-variables) documents a zero stamp default; its [server configuration](https://github.com/ethersphere/swarm-gateway#configuration) supports supplying postage at the service. These explain the placeholder but do not identify the batch used for our files. A content reference and successful download do not prove which batch paid for it.

To complete the required attribution, we need the operator's actual batch ID for the example uploads and provider confirmation, or a fresh end-to-end example uploaded using an explicitly supplied funded Bee batch with recorded provenance. Garuda already supports that [Bee configuration](../docs/swarm-artwork.md#operator-configuration). We do not automatically buy or top up batches. Missing postage evidence is tracked in beads as `garuda-cx9`; no funded-batch claim is made here.

An operator request can use these public details: “We uploaded Signature #53's artwork through `https://api.gateway.ethswarm.org` around **6 November 2026, 21:44 UTC**, producing reference `7b38bf6f2497909a0eb67d73e80eed04c9f729b63a7e846df20b59f7fa5eb9b1`. For ETHGlobal's Arkiv + Swarm submission, can you confirm the actual postage batch ID and who supplied it? Our client used the gateway's all-zero placeholder.” This is a draft for the team to send; no operator confirmation has been received. If the provider cannot recover that attribution, ask the Swarm booth for a known funded batch usable through a Bee service and record a new linked example.

## Code that uploads and reads

| Repository file | Responsibility |
| --- | --- |
| [`server/media/artwork.ts`](../server/media/artwork.ts) | Builds SVG/JSON from verified stake snapshot inputs, using the existing renderer. |
| [`server/media/swarm.ts`](../server/media/swarm.ts) | `uploadFile()` sends files to `/bzz`; `verifyFile()` reads them back and compares SHA-256. Separates public gateway and private Bee configuration. |
| [`server/media/publication.ts`](../server/media/publication.ts) | Durable queue, Arkiv media schema, publication/read-back and recovery of existing manifests. |
| [`server/maintenance.ts`](../server/maintenance.ts) | Runs queued media work; production invokes it through the protected scheduled worker. |
| [`src/lib/market/media.ts`](../src/lib/market/media.ts) | Browser gateway URL validation, bounded reads and image checksum verification. |
| [`src/components/market/ArtworkBackupDialog.tsx`](../src/components/market/ArtworkBackupDialog.tsx) | Artwork viewer, gateway choice and portable reference export. |
| [`scripts/swarm-proof.mjs`](../scripts/swarm-proof.mjs) | Reproducible direct Arkiv→Swarm read, plus an explicit one-file upload using the same transport as the worker. |
| [`scripts/test-swarm-media.mjs`](../scripts/test-swarm-media.mjs) | Automated coverage for configuration boundaries, checksums, retries, publication and recovery. |

## Run one read and one upload

From the repo root, use **Node 22.23.4 or newer within Node 22**, then `npm ci`. These proof commands require internet access to Arkiv Rabdi and a Swarm read gateway; they do not require PostgreSQL, a wallet, a signing key, the original image server or a running Garuda API. Public Arkiv reads can return `429 ANON_COST_LIMITED`; an optional `ARKIV_ACCESS_KEY` from [Arkiv Hub](https://hub.arkiv.network/access-keys) reduces that dependency on the anonymous quota. Keep it in the local/server environment, not the submitted Markdown. The script uses only that read key and an optional `SWARM_GATEWAY_URL`; it never constructs a wallet client.

### Read the real entity and both files

```sh
node --env-file-if-exists=.env.local --import tsx scripts/swarm-proof.mjs read
```

The command reads #53's **actual Arkiv entity**, verifies its publisher, indexed identity and manifest against the recorded evidence, fetches both Swarm files, checks both SHA-256 digests and the metadata's image reference, then saves `stake-53.svg`, `stake-53.json` and `receipt.json` in a newly created temporary directory. Expected output includes `arkivManifestVerified: true`, `filesVerified: true` and `savedDirectory`. Open the SVG there to see the artwork. This verifies the historical copy, not current Ethereum ownership or order availability.

To use a different compatible read gateway, set `SWARM_GATEWAY_URL` to its base URL before running the command. It must serve `/bzz/<reference>/`; HTTPS is required except for a local Bee node. A failed/expired entity read, unavailable file or checksum mismatch causes a nonzero exit, not a successful proof. An exported receipt preserves the references after Arkiv expiry, but cannot restore missing Swarm bytes.

### Upload one public artwork copy, then read it back

```sh
node --env-file-if-exists=.env.local --import tsx scripts/swarm-proof.mjs upload
```

This first performs the same verified read, then uploads **one copy of the already-public #53 SVG** to the official free public gateway using production `uploadFile()`, and checks the returned reference with `verifyFile()`. Expected output adds `upload.reference`, `upload.sha256`, an openable `upload.url`, and `upload.verified: true`. Content addressing may reuse data; a successful upload need not create novel bytes. The command intentionally identifies this as a verification copy: **it does not create an order or publish a new Arkiv entity**, and it does not resolve the missing funded batch ID. No private Bee token or batch setting is sent.

Both commands passed on **7 November 2026, approximately 04:28 IST (6 November, 22:58 UTC)** without an Arkiv access key or Garuda API. The upload proof produced [`19d59dae8d1ddfda79cd426c96000d1eeeea5495e9eee338afa63b477fb84688`](https://api.gateway.ethswarm.org/bzz/19d59dae8d1ddfda79cd426c96000d1eeeea5495e9eee338afa63b477fb84688/), whose downloaded bytes matched #53's image SHA-256. See `submissionProof` in the [evidence JSON](../docs/swarm-live-evidence.json). This verification copy is separate from the original reference linked by the Arkiv entity above. All 15 Swarm tests also passed.

For a new **product-flow** example, configure the [worker prerequisites](../docs/swarm-artwork.md#operator-configuration), start the API with `npm run server` and the frontend with `npm run dev`, and create a valid listing or bid for a supported Ethereum-mainnet stake. This requires the real wallet, any necessary approvals/funds, a funded Arkiv publisher, and a working upload provider. The accepted order queues media work automatically; the worker uploads SVG and JSON, verifies both, publishes their manifest on Arkiv and marks the backup `ready`. Open **Artwork backup** to view/export it. Existing completed backups are recovered rather than re-uploaded. Production uses the protected minute cron; unavailable orders and upload rate limits can delay or prevent a new example.

## Demo video moment

**Final video URL and actual timestamp: not supplied yet.** The existing screenshot and receipts demonstrate working functionality but are not a video submission.

The team plans to include this in the overall project demo. A separate artwork video is not required by the linked bonus rules: reserve roughly 20–30 seconds for the visible flow and publish its exact timestamp here. If the same video is submitted for CROPS, keep the whole video within that prize's three-minute limit.

The intended Swarm segment should show #53's **Artwork backup** opening, the real image loading, **Portable references** exposing the Arkiv link and Swarm reference, and the direct proof command retrieving that same file with Garuda's API/original metadata host unavailable. Show the successful checksum result and explain “the picture remains retrievable from the public reference.” Include the upload result if demonstrating a fresh upload. Replace this paragraph with the final video link and exact time range once recorded; do not describe an unrecorded outage or another gateway as already demonstrated.

## What got in our way

| Friction | Expectation, observation and improvement |
| --- | --- |
| Funded postage is hidden by the public gateway | We expected the upload receipt to identify the postage used. It gives the file reference; the zero placeholder does not identify the real batch, and `/stamps` is unavailable publicly. Reproduce with the upload command and inspect its response. A response field/header or public receipt tying reference → batch → provider, with retention information, would make attribution and hackathon evidence much easier. |
| Upload host versus browsing host | The human-facing gateway website and API use different hosts. Garuda fixes the public upload host to `api.gateway.ethswarm.org`; a copyable small-file API example beside the gateway UI would reduce setup ambiguity. |
| Retention is separate from discovery lifetime | Arkiv has a 90-day media-entity lifetime; the shared gateway does not give this integration a matching file-retention promise. A documented TTL/renewal contract for gateway uploads would help users understand whether their backup will outlive an order. We disclose the two lifetimes separately. |
| A successful upload is not a completed backup | Our integration must survive a failed read-back or Arkiv publication without uploading again. We persist returned references and retry verification/publication separately. This is an application failure mode covered in tests, not a claim that Swarm lost one of our uploaded files. |
| Local and production databases differ | The first real backups existed before production enabled the worker. Recovery now queries Arkiv, verifies the original manifest/files and restores the receipt, preserving the original snapshot. This was an integration issue, not a Swarm protocol failure. |

## Public data, integrity and remaining dependencies

All current artwork and metadata are **public and unencrypted**. Uploads do not request Swarm encryption; upload receipts and read URLs accept only **64 hexadecimal characters** (a 32-byte reference). A raw 128-hex encrypted reference is rejected. An encrypted reference includes its decryption key: any future private-media feature must keep it off public Arkiv or encrypt it separately before publication. We do not claim encrypted or anonymous storage.

Arkiv reveals NFT/order identifiers and file references. The upload service sees the public bytes and server connection; a read gateway sees the reader's IP and requested reference. No wallet secret is uploaded. The viewer checks image SHA-256 and renders SVG as an isolated image rather than inline HTML. Integrity remains relative to the recorded receipt and trusted publisher/block observation; it does not make the publisher trustless.

Initial publication depends on our worker, PostgreSQL queue, Ethereum RPC, Arkiv publisher and upload service. The in-app viewer still obtains status from our API. Once recorded, direct Arkiv reads or exported receipts let users retrieve retained files independently. Same-service upload/read has been verified; independent-gateway replication/failover is not established by that alone. This is a concrete availability improvement for CROPS, with those dependencies stated.

## Submission selection and remaining evidence

Submit under **Build on Arkiv (existing projects)** and also select **Arkiv + Swarm bonus (existing projects)**. Under the linked prize rules, these share one Arkiv partner-prize selection.

The repo has the data split, exact fields, live entity/file links, code locations, runnable commands, before/after scope and friction report. The actual funded postage batch evidence and final video moment remain missing; Continuity acceptance and the eligible event-start baseline also remain unconfirmed. These are tracked through beads alongside the existing submission-evidence issue `garuda-fo4`. The live integration alone is not a claim that every qualification requirement is fulfilled.

For Continuity, check the team's ETHGlobal application/acceptance or ask event staff to confirm that WiseOne/Garuda is registered under **Extend Open Source** or **Ship a Feature**, rather than the from-scratch track. ETHGlobal describes Continuity as opt-in and requiring advance application/notification in its [official announcement](https://paragraph.com/@blog.ethglobal/changing-how-hackathons-work). Selecting a partner bonus or updating this README does not itself confirm acceptance. The baseline is the documented starting code and reused assets; it is separate from the team's track registration.
