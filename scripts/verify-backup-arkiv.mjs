// Read-only live smoke check. No environment file, private key, wallet, or Garuda API.
import assert from 'node:assert/strict';
import { createPublicClient, getAddress, http } from 'viem';
import { mainnet } from 'viem/chains';
import { arkivRecovery, recoveryRequest, discoverRecoveryOrders, verifyRecoveredOrder } from '../src/lib/backup/arkiv.ts';
import { verifyBackupContracts } from '../src/lib/backup/core.ts';

const request = recoveryRequest(arkivRecovery.rpc);
assert.equal(BigInt(await request('eth_chainId', [])), BigInt(arkivRecovery.chainId));
let account = process.argv[2];
if (!account) {
  // Select a public maker from the deployed Signature scope for a reproducible read-only check.
  const page = await request('arkiv_query', [`arkiv.schema = str('wiseone.garuda.orders.v2') AND scope = str('${arkivRecovery.scope}') AND $owner = addr(${arkivRecovery.publisher}) ORDER BY $key:key ASC`,
    { select: { attributes: { maker: true } }, limit: '0x1' }]);
  account = page.data?.[0]?.attributes?.find(a => a.name === 'maker')?.value;
  assert.ok(account, 'No live publication found. Supply a wallet address after publishing an order.');
}
account = getAddress(account.toLowerCase());
const found = await discoverRecoveryOrders(request, account);
assert.equal(found.failedSchemas, 0); assert.equal(found.rejected, 0);
assert.ok(found.orders.length, 'Expected at least one live published order for this wallet');
const client = createPublicClient({ chain: mainnet, transport: http('https://ethereum-rpc.publicnode.com', { retryCount: 0, timeout: 20_000 }), cacheTime: 0 });
const block = await verifyBackupContracts(client);
for (const order of found.orders) {
  const status = await verifyRecoveredOrder(client, order, 1, block);
  console.log(JSON.stringify({ orderHash: order.hash, schemaVersion: order.version, relation: order.relation,
    status: status.state, ethereumBlock: String(status.blockNumber) }));
}
console.log(`PASS ${found.orders.length} live orders read directly from public Rabdi; signatures and Ethereum status checked. No transaction submitted.`);
