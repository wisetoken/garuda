// Read-only verification of the published source against Ethereum. No wallet or private key.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createPublicClient, http, keccak256 } from 'viem';
import { mainnet } from 'viem/chains';
const at = path => new URL(path, import.meta.url);
const deployment = JSON.parse(await readFile(at('./deployments/ethereum-mainnet/sales-deployment.json')));
const verification = JSON.parse(await readFile(at('./deployments/ethereum-mainnet/verification.json')));
const inputBytes = await readFile(at('./deployments/ethereum-mainnet/SignatureSeaportZone.standard-input.json'));
assert.equal(createHash('sha256').update(inputBytes).digest('hex'), verification.standardInputSha256);
const input = JSON.parse(inputBytes.toString());
for (const [path, source] of Object.entries(input.sources)) {
  assert.equal(await readFile(at(`./${path}`), 'utf8'), source.content, `${path} must match the verified source exactly`);
}
const artifact = JSON.parse(await readFile(at('./out/SignatureSeaportZone.sol/SignatureSeaportZone.json')));
const client = createPublicClient({ chain: mainnet, transport: http('https://ethereum-rpc.publicnode.com') });
assert.equal(await client.getChainId(), 1);
const blockNumber = await client.getBlockNumber();
const code = await client.getCode({ address: deployment.adapter, blockNumber });
assert.ok(code);
assert.equal(keccak256(code), deployment.adapterCodeHash);
const live = Buffer.from(code.slice(2), 'hex');
const compiled = Buffer.from(artifact.deployedBytecode.object.replace(/^0x/, ''), 'hex');
assert.equal(live.length, compiled.length);
// Solidity fills immutable slots at deployment; compare all remaining executable bytes and metadata.
for (const locations of Object.values(artifact.deployedBytecode.immutableReferences)) {
  for (const { start, length } of locations) {
    live.fill(0, start, start + length);
    compiled.fill(0, start, start + length);
  }
}
assert.deepEqual(live, compiled, 'Compiled runtime and metadata must match deployed code outside immutable slots');
const read = functionName => client.readContract({ address: deployment.adapter, abi: artifact.abi, functionName, blockNumber });
const [collection, wise, seaport, feeBps, recipient, collectionHash, wiseHash, seaportHash, owner, paused] = await Promise.all([
  read('collection'), read('WISE'), read('SEAPORT'), read('FEE_BPS'), read('FEE_RECIPIENT'),
  read('COLLECTION_CODE_HASH'), read('WISE_CODE_HASH'), read('SEAPORT_CODE_HASH'), read('owner'), read('newActivityPaused'),
]);
for (const [actual, expected] of [[collection, deployment.collection], [wise, deployment.currency], [seaport, deployment.market], [recipient, deployment.feeRecipient]]) assert.equal(actual.toLowerCase(), expected.toLowerCase());
assert.equal(Number(feeBps), deployment.feeBps);
assert.equal(collectionHash, deployment.collectionCodeHash);
assert.equal(wiseHash, deployment.currencyCodeHash);
assert.equal(seaportHash, deployment.marketCodeHash);
console.log(JSON.stringify({ address: deployment.adapter, blockNumber: blockNumber.toString(), sourceInputSha256: verification.standardInputSha256, runtimeCodeHash: keccak256(code), sourceFilesMatch: true, compiledRuntimeMatches: true, immutableConfigurationMatches: true, owner, paused }, null, 2));
