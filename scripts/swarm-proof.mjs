// Judge-facing proof: read the recorded #53 manifest directly from Arkiv, then Swarm.
// `upload` additionally uploads one public artwork copy. No signing key or Garuda API is used.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { http, hexToString } from 'viem';
import { ArkivMedia } from '../server/media/publication.ts';
import { boundedBody, sha256, swarmConfig, uploadFile, verifyFile, PUBLIC_SWARM_GATEWAY } from '../server/media/swarm.ts';
import { swarmFileUrl } from '../src/lib/market/media.ts';

const mode = process.argv[2] ?? 'read';
if (!['read', 'upload'].includes(mode) || process.argv.length > 3) {
  throw new Error('Usage: node --import tsx scripts/swarm-proof.mjs [read|upload]');
}
try {
  const evidence = JSON.parse(await readFile(new URL('../docs/swarm-live-evidence.json', import.meta.url), 'utf8'));
  const example = evidence.backups.find(({ receipt }) => receipt.tokenId === '53');
  const expected = example.receipt;
  // Only an optional read access key is used. Never construct a wallet client.
  const reader = createPublicClient({
    chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? '' }),
    transport: http(undefined, { timeout: 20_000, retryCount: 0 }),
  });
  assert.equal(await reader.getChainId(), evidence.arkivChainId);
  const entity = await reader.getEntity(expected.arkivEntity, ArkivMedia);
  assert.equal(entity.$owner.toLowerCase(), evidence.arkivPublisher.toLowerCase());
  assert.equal(entity.scope.value, example.arkivScope);
  assert.equal(entity.orderHash.value, expected.orderHash);
  assert.equal(entity.collection.value.toLowerCase(), expected.collection.toLowerCase());
  assert.equal(entity.tokenId.value, expected.tokenId);
  assert.equal(entity.renderer.value, expected.renderer);
  assert.ok(entity.manifest.value.length <= 32_770, 'Manifest exceeds size limit');
  const receipt = JSON.parse(hexToString(entity.manifest.value));
  for (const field of ['version', 'chainId', 'collection', 'tokenId', 'orderHash', 'renderer',
    'observedBlock', 'observedBlockHash', 'observedAt', 'verifiedAt', 'image', 'metadata']) {
    assert.deepEqual(receipt[field], expected[field], `Recorded ${field} differs from Arkiv`);
  }
  const gateway = process.env.SWARM_GATEWAY_URL || PUBLIC_SWARM_GATEWAY;
  const files = {};
  for (const kind of ['image', 'metadata']) {
    const file = receipt[kind];
    assert.match(file.reference, /^[a-f0-9]{64}$/, 'Only public, unencrypted references are supported');
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    const response = await fetch(swarmFileUrl(gateway, file.reference), {
      redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30_000),
    });
    files[kind] = await boundedBody(response);
    assert.equal(sha256(files[kind]), file.sha256, `${kind} checksum mismatch`);
  }
  const metadata = JSON.parse(new TextDecoder().decode(files.metadata));
  assert.equal(metadata.image, `bzz://${receipt.image.reference}/`);
  assert.equal(metadata.image_sha256, receipt.image.sha256);
  assert.equal(metadata.properties.order_hash, receipt.orderHash);
  assert.equal(metadata.properties.token_id, receipt.tokenId);
  const directory = await mkdtemp(join(tmpdir(), 'garuda-swarm-proof-'));
  await writeFile(join(directory, 'stake-53.svg'), files.image);
  await writeFile(join(directory, 'stake-53.json'), files.metadata);
  await writeFile(join(directory, 'receipt.json'), JSON.stringify({ ...receipt, arkivEntity: entity.$key }, null, 2) + '\n');
  const result = { checkedAt: new Date().toISOString(), mode, arkivEntity: entity.$key,
    publisher: entity.$owner, gateway, image: receipt.image, metadata: receipt.metadata,
    arkivManifestVerified: true, filesVerified: true, savedDirectory: directory };
  if (mode === 'upload') {
    // Fixed free public service; do not load private Bee endpoints, tokens or postage settings.
    const config = swarmConfig({ SWARM_MEDIA_ENABLED: 'true', SWARM_UPLOAD_MODE: 'public-gateway', SWARM_GATEWAY_URL: gateway });
    const copy = await uploadFile(config, files.image, 'image/svg+xml', 'garuda-signature-53-proof.svg');
    await verifyFile(config, copy);
    result.upload = { ...copy, url: swarmFileUrl(gateway, copy.reference), verified: true,
      service: config.bee, postageProvider: 'Swarm public gateway', actualBatchId: null,
      note: 'Verification copy of existing public artwork; this command does not publish an Arkiv entity.' };
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // RPC errors can contain an access-key URL. Do not print the underlying request.
  console.error(error instanceof assert.AssertionError ? error.message :
    'Swarm proof failed. Check Arkiv access/rate limits, entity expiry and gateway availability; see arkiv/swarm.md. No successful proof was recorded.');
  process.exitCode = 1;
}
