# Swarm artwork backups

Status: live uploads, checksum-verified retrieval and Arkiv publication verified on 7 November 2026 from the local Garuda deployment. Signature listings #53 and #61 and a bid for #61 have completed backups. The #61 artwork viewer was checked in the browser. See [live receipts and verification evidence](swarm-live-evidence.json). Uploads remain opt-in for each deployment; local configuration does not enable the production worker.

Garuda can generate an artwork snapshot when a listing or bid is accepted, upload the SVG and JSON metadata to Swarm, and publish a separate reference entity on Arkiv. Users open **Artwork backup** from an order's menu to view it, change the read gateway or download its references. The same artwork renderer already exists in WiseOne/yoda; the new work is the storage, verification and reference path.

This preserves a generated snapshot independently of the original image service. It does not rewrite the NFT's `tokenURI`, mirror arbitrary remote images, change signed offers or replace Ethereum ownership checks. The SVG contains its logo inline and does not load fonts, analytics or images from external hosts.

## Operator configuration

Choose an upload provider. The [official public Swarm gateway](https://www.ethswarm.org/access/) accepts small files without operating your own node or buying a postage batch. This is the mode used for the live examples below. It is a shared service: availability, rate limits and retention depend on its operator, and Garuda makes no permanence guarantee.

For the public gateway, set:

```dotenv
SWARM_MEDIA_ENABLED=true
SWARM_UPLOAD_MODE=public-gateway
SWARM_GATEWAY_URL=https://api.gateway.ethswarm.org
```

Leave `SWARM_BEE_URL`, `SWARM_POSTAGE_BATCH_ID` and `SWARM_BEE_API_TOKEN` empty in this mode. Configuration rejects private Bee settings instead of forwarding them to the public gateway. The transport uses the gateway's zero batch placeholder; this is not a funded batch owned by Garuda. Use the API host above, not the gateway's browsing website.

Alternatively, set `SWARM_UPLOAD_MODE=bee` and use your own Bee node and a funded postage batch usable on that node. This integration does not buy stamps, fund wallets or top up postage. See the official [Bee upload API](https://docs.ethswarm.org/api/), [upload prerequisites](https://bee-js.ethswarm.org/docs/upload-download/) and [postage model](https://docs.ethswarm.org/docs/learn/technology/contracts/postage-stamp/).

Set these server-only variables in the deployment environment or local `.env.local`. Never prefix them with `VITE_` or commit credentials:

| Variable | Value |
| --- | --- |
| `SWARM_MEDIA_ENABLED` | `false` by default; `true` enables the worker |
| `SWARM_UPLOAD_MODE` | `public-gateway` or `bee`; omitted mode preserves the original `bee` behavior |
| `SWARM_BEE_URL` | Required only in `bee` mode; HTTPS, or loopback HTTP for a local node |
| `SWARM_POSTAGE_BATCH_ID` | Required only in `bee` mode; existing usable batch ID, 64 hex characters without `0x` |
| `SWARM_BEE_API_TOKEN` | Optional in `bee` mode if the node's reverse proxy requires a Bearer token |
| `SWARM_GATEWAY_URL` | Defaults to `https://api.gateway.ethswarm.org`; public HTTPS read gateway base URL without `/bzz`, credentials, query parameters or fragment; loopback HTTP is allowed for development |

The read gateway must serve `/bzz/{reference}/` without authentication or redirects, and allow browser CORS reads from the Garuda origin. Prefer a separate gateway from the upload node: retrieving only from the same node does not demonstrate replication. Only the public gateway URL reaches the browser; the Bee URL, batch ID and upload token remain on the server. Protect the Bee upload API separately from the public read path.

The existing market PostgreSQL, Ethereum RPC and funded Rabdi publisher configuration are also required. After setting configuration, restart the market API (`npm run server` locally). Startup adds the media queue table and queues unexpired catalog orders; new listings and bids enqueue in the order-save transaction. **Enabling the worker authorizes uploads for these existing eligible orders as well as new ones.** It does not require another user signature and does not spend the user's Ethereum funds.

Each collection deployment permits at most four upload attempts per hour, each potentially uploading an artwork file and its metadata. Unavailable orders and retries that only verify existing files or publish their references do not consume this upload budget. This bounds upload activity but is not a currency-denominated spending limit. The operator pays Arkiv publication costs and, in Bee mode, Swarm postage; the public gateway supplies its own postage. With `SWARM_MEDIA_ENABLED=false`, the worker makes no Swarm uploads or Arkiv media writes; previously completed receipts remain available.

For production, apply these variables to the market API deployment and redeploy it. The protected maintenance cron must also be configured and running; see [hosting configuration](../README.md). Changing only the browser build or local `.env.local` does not enable production uploads.

## Publication and verification

The worker first verifies that the order is available on Ethereum. It reads a fresh stake snapshot, checks identity and block provenance, and renders the SVG. JSON metadata includes chain, collection, token/stake ID, principal, start/maturity dates, observed block/hash/time, order hash and renderer version. It excludes private keys and the order signature.

Both files upload through the provider's `/bzz` API with non-deferred upload requested. Bee mode also requests local pinning; public-gateway mode sends neither pinning nor authentication headers. Their returned references and SHA-256 digests are saved. A configured read gateway must return both exact files before the worker publishes the reference to Arkiv. The media job becomes `ready` only after that Arkiv entity has been read back successfully.

Retries retain the generated bytes and any saved upload references, so a gateway or Arkiv outage does not regenerate the artwork or re-upload files with recorded receipts. A lost upload response can require another upload attempt; this is not an exactly-once billing guarantee. A PostgreSQL lease coordinates jobs and the shared publisher lock serializes Arkiv writes. Expired, cancelled or otherwise terminally unavailable orders stop pending work. Completed backups remain snapshots after an order changes state.

A fresh deployment first looks for an existing media manifest from the expected Arkiv publisher and deployment scope. It validates the order/NFT identity, original Ethereum block and both file checksums before restoring the completed receipt to its database. This preserves the original snapshot and avoids uploading conflicting metadata for an order already backed up by another deployment. An unavailable Arkiv read or failed verification retries without replacing the published copy.

The browser fetches artwork without credentials or referrer, rejects redirects and responses over 1 MB, and checks its SHA-256 before displaying it in an isolated image element. It never inserts the SVG as inline HTML. A failed fetch or checksum shows an error and lets the user change gateways. The saved receipt provides integrity relative to the recorded copy; it does not eliminate trust in the publisher, original Ethereum RPC observation or contracts.

## Arkiv reference schema

`wiseone.garuda.media.v1` contains indexed `scope`, `orderHash`, `collection`, `tokenId` and `renderer`, plus a `manifest` bytes field containing the receipt JSON. The dedicated configured Rabdi publisher owns it. Consumers must filter by expected publisher and deployment scope; a matching token ID alone does not establish authenticity.

The receipt contains separate artwork and metadata Swarm references and SHA-256 digests, the NFT identity, order hash, renderer version, observed Ethereum block/hash/time and verification time. The API/export adds the Arkiv entity key after publication. In the explorer or SDK, decode `manifest` as UTF-8 JSON; references can then be used without Garuda's database or API.

Media references live on Arkiv for **90 days**, with no automatic renewal implemented. That lifetime is independent of the signed offer deadline, the stake's Ethereum maturity and the 15-minute display cache. Swarm retention depends on postage and network availability; local pinning alone does not guarantee remote persistence. A downloaded receipt keeps the references after the Arkiv entity expires but cannot recover bytes evicted from Swarm.

Code: [worker/schema](../server/media/publication.ts), [Bee transport](../server/media/swarm.ts), [renderer inputs](../server/media/artwork.ts), [viewer](../src/components/market/ArtworkBackupDialog.tsx). Status reads use `/api/garuda/media/{orderHash}` (or `/api/garuda/advanced/media/{orderHash}`). No public upload endpoint is exposed.

## Independent retrieval

In the viewer, use **Save references** while Garuda is reachable, or obtain the manifest directly from its Arkiv entity while that entity exists. Given the downloaded receipt and any compatible gateway, this command needs neither the Garuda API nor the original NFT metadata host:

```sh
node --input-type=module - ./stake-40-swarm-backup.json https://your-gateway.example <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const receipt = JSON.parse(await readFile(process.argv[2], 'utf8'));
const gateway = new URL(process.argv[3]);
if (gateway.protocol !== 'https:' || gateway.username || gateway.password || gateway.search || gateway.hash)
  throw new Error('Use an HTTPS gateway without credentials');
for (const [kind, filename] of [['image', 'artwork.svg'], ['metadata', 'metadata.json']]) {
  const file = receipt[kind];
  if (!/^[a-f0-9]{64}$/.test(file.reference) || !/^[a-f0-9]{64}$/.test(file.sha256))
    throw new Error('Invalid receipt');
  const response = await fetch(`${gateway.href.replace(/\/$/, '')}/bzz/${file.reference}/`,
    { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`Cannot retrieve ${kind}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('File exceeds limit');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256)
    throw new Error(`Checksum mismatch: ${kind}`);
  await writeFile(filename, bytes, { flag: 'wx' });
  console.log(`Verified ${filename}`);
}
JS
```

## Validation and demonstration

`node --import tsx --test scripts/test-swarm-media.mjs` covers opt-in configuration, credential boundaries, deterministic self-contained artwork, identity/freshness checks, size limits, checksum rejection, retries without repeat uploads, terminal order/reorg handling and publication failures. It makes no real uploads or blockchain writes.

On 6 November 2026, all 140 repository tests and the production build passed. The disabled state was checked against the local market API. The completed-backup viewer was browser-checked with labelled sample data and a temporary local read server, including artwork display, gateway failure/recovery and portable-reference display. These are implementation checks, not evidence of live Swarm storage.

On 7 November 2026, the local worker completed real uploads through `https://api.gateway.ethswarm.org`. Both files for each of the following orders were independently fetched again and matched their saved SHA-256 digests. Their Arkiv manifests were read back and matched the saved receipts and expected publisher. The browser displayed Stake #61 from Swarm, replacing the earlier disabled state.

| Signature order | Ethereum observation | Arkiv manifest |
| --- | --- | --- |
| Listing #53 | Block 26358579 | [View reference](https://rabdi.explorer.arkiv.network/entity/0xdb4995a90ca41235939cac4f14a54e89be1d97244ece56965f50202ef9c4f439) |
| Listing #61 | Block 26358584 | [View reference](https://rabdi.explorer.arkiv.network/entity/0x0254a5de65f939a873574ac1480a13d8230d7750e78bb0334ab4ed8782825f69) |
| Bid #61 | Block 26358587 | [View reference](https://rabdi.explorer.arkiv.network/entity/0x53d1d8f73bd6b91cfe484e83e716276d6715b96d1151bcd27b4c3d0683e93176) |

The [evidence JSON](swarm-live-evidence.json) records full file references, checksums, order hashes, block provenance and the verification time. These are observations at that time, not ongoing availability promises. The same public service accepted uploads and served the verified files; independent gateway failover and a demo with Garuda stopped have not yet been demonstrated. For that stronger CROPS demo, export a receipt, stop the Garuda API and original metadata service, and use the independent retrieval command through another compatible gateway.

The completed integration includes tests for recovering existing manifests into a fresh deployment, rejecting mismatched identity/provenance, and retrying without repeat uploads. The viewer's reference export was checked to contain both file checksums and its Arkiv entity link.

## Privacy and remaining dependencies

Artwork, metadata and Arkiv manifests are public. They identify the NFT and order, so they can be correlated with public wallet activity. Bee receives uploaded bytes and server connection metadata; gateways see reader IPs and requested references. No wallet secret is uploaded. This is an availability improvement, not anonymous or encrypted storage.

Initial uploads depend on our worker, database, upload provider, its postage and our Arkiv publisher. Public-gateway mode adds a shared upload service dependency; Bee mode lets an operator control the node and postage. Retrieval depends on retained Swarm data and an available gateway; users can choose another gateway. The current in-app viewer asks our API for status, while exported references and direct Arkiv reads provide the independent path. The standalone position-recovery HTML does not currently include this artwork viewer.
