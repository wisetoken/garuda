import test from 'node:test';
import assert from 'node:assert/strict';
import { stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arkivRecovery, parseRecoveryEntity, discoverRecoveryOrders, recoveryRequest, verifyRecoveredOrder } from '../src/lib/backup/arkiv.ts';
import { backupDeployment as d, backupDeployments, createBackup, createBackupFile, parseBackupFile } from '../src/lib/backup/core.ts';
import { parseSignedSale } from '../src/lib/blend/sales.ts';
import { seaportTypedData } from '../src/lib/blend/seaport.ts';
import { recoveryEntity } from './fixtures/arkiv-recovery.mjs';

import { recoverySnapshots, visibleRecoveryEntries, verifyRecoveryEntries, canCancelRecovered, canExportRecovered } from '../src/lib/backup/recovery-view.ts';
import { paymentTokens } from '../src/lib/blend/payment-tokens.ts';

const maker = privateKeyToAccount(`0x${'31'.repeat(32)}`);
const stranger = privateKeyToAccount(`0x${'32'.repeat(32)}`);
const base = { kind: 0, maker: maker.address, owner: maker.address, collection: d.collection, currency: d.currency,
  tokenId: '20', amount: '1000000000000000000', nonce: '1', epoch: '0', counter: '4',
  startTime: '1700000000', deadline: '1700086400', feeBps: d.feeBps, feeRecipient: d.feeRecipient,
  stakeId: `0x${'12'.repeat(16)}`, stateHash: `0x${'34'.repeat(32)}` };
async function signedOrder(patch = {}) {
  const order = { ...base, ...patch }, parsed = parseSignedSale({ order, signature: '0x00' }, d);
  return { order, signature: await maker.signTypedData(seaportTypedData(d, parsed.order)) };
}
const signed = await signedOrder();
const recovered = parseRecoveryEntity(recoveryEntity(signed), 2, maker.address, 100n);
const block = { number: 123n, timestamp: 1700000100n };
function reader(overrides = {}) {
  return { getCode: async () => '0x', readContract: async ({ functionName }) => {
    if (functionName === 'getOrderHash') return recovered.hash;
    if (functionName === 'getCounter') return 4n;
    if (functionName === 'getOrderStatus') return [false, false, 0n, 0n];
    throw new Error('unexpected contract method');
  }, ...overrides };
}

test('Arkiv v1/v2 wire records preserve signed terms and distinguish maker from incoming bidder', async () => {
  for (const version of [1, 2]) {
    assert.equal(parseRecoveryEntity(recoveryEntity(signed, version), version, maker.address, 1n).relation, 'own');
    const bid = await signedOrder({ kind: 1, owner: stranger.address });
    const incoming = parseRecoveryEntity(recoveryEntity(bid, version), version, stranger.address, 1n);
    assert.equal(incoming.relation, 'incoming');
    assert.throws(() => createBackup(stranger.address, [incoming.signed]), /another wallet/);
    assert.equal(parseRecoveryEntity(recoveryEntity(bid, version), version, maker.address, 1n).relation, 'own');
  }
  assert.throws(() => parseRecoveryEntity(recoveryEntity(signed), 2, stranger.address, 1n), /does not concern/);
});

test('rejects hostile discovery metadata, mismatched signed terms and expired storage', () => {
  for (const field of ['arkiv.schema', 'scope', 'maker', 'stakeOwner', 'collection', 'tokenId', 'price', 'expires', 'orderHash', 'chainId', 'currency', 'envelope']) {
    const entity = recoveryEntity(signed), attr = entity.attributes.find(a => a.name === field);
    attr.value = field === 'envelope' ? stringToHex('{}') : attr.type.startsWith('u') ? '0x0' : 'wrong';
    assert.throws(() => parseRecoveryEntity(entity, 2, maker.address, 1n), field);
  }
  for (const mutate of [e => e.attributes.push(e.attributes[0]), e => e.owner = stranger.address,
    e => e.expiresAt = '0x1', e => e.key = 'bad', e => e.attributes.find(a => a.name === 'price').type = 'str']) {
    const entity = recoveryEntity(signed); mutate(entity);
    assert.throws(() => parseRecoveryEntity(entity, 2, maker.address, 1n));
  }
});

test('signature verification rejects forged and wrong-domain signatures, and pins Ethereum status to one block', async () => {
  const calls = [];
  const client = reader({ readContract: async request => { calls.push(request); return reader().readContract(request); } });
  assert.equal((await verifyRecoveredOrder(client, recovered, 1, block)).state, 'open');
  assert.ok(calls.every(call => call.blockNumber === block.number));
  const parsed = parseSignedSale(signed, d);
  for (const signature of [await stranger.signTypedData(seaportTypedData(d, parsed.order)),
    await maker.signTypedData(seaportTypedData({ ...d, chainId: 31337 }, parsed.order))]) {
    await assert.rejects(verifyRecoveredOrder(reader(), { ...recovered, signed: { ...signed, signature } }, 1, block), /signature/);
  }
  await assert.rejects(verifyRecoveredOrder(reader({ readContract: async request => request.functionName === 'getOrderHash' ? '0xwrong' : reader().readContract(request) }), recovered, 1, block), /hash mismatch/);
  await assert.rejects(verifyRecoveredOrder({ getChainId: async () => 31337 }, recovered), /wrong network/);
});

test('status detects cancellation, fills, counter invalidation, signed expiry and future start; ERC1271 fails closed', async () => {
  for (const [expected, patch, at] of [
    ['cancelled', { getOrderStatus: [false, true, 0n, 0n] }],
    ['filled', { getOrderStatus: [true, false, 1n, 2n] }],
    ['counter-invalidated', { getCounter: 5n }],
    ['expired', {}, { ...block, timestamp: 1700086400n }],
    ['not-started', {}, { ...block, timestamp: 1699999999n }],
  ]) {
    const client = reader({ readContract: async req => patch[req.functionName] ?? reader().readContract(req) });
    assert.equal((await verifyRecoveredOrder(client, recovered, 1, at ?? block)).state, expected);
  }
  for (const valid of [true, false]) {
    const client = reader({ getCode: async () => '0x1234', readContract: async req => req.functionName === 'isValidSignature'
      ? valid ? '0x1626ba7e' : '0xffffffff' : reader().readContract(req) });
    if (valid) assert.equal((await verifyRecoveredOrder(client, recovered, 1, block)).state, 'open');
    else await assert.rejects(verifyRecoveredOrder(client, recovered, 1, block), /signature/);
  }
});

test('direct bounded discovery deduplicates v2/v1 and reports malformed, partial and truncated pages', async () => {
  const calls = [];
  const request = async (method, params) => {
    calls.push([method, params]);
    if (method === 'eth_chainId') return `0x${arkivRecovery.chainId.toString(16)}`;
    const version = params[0].includes('orders.v2') ? 2 : 1;
    return { data: [recoveryEntity(signed, version), {}], blockNumber: '0x123' };
  };
  const found = await discoverRecoveryOrders(request, maker.address);
  assert.equal(found.orders.length, 1); assert.equal(found.orders[0].version, 2); assert.equal(found.rejected, 2);
  assert.equal(found.failedSchemas, 0); assert.equal(calls.length, 3);
  assert.match(calls[1][1][0], /ORDER BY \$key:key ASC/);
  assert.match(calls[1][1][0], /stakeOwner = addr\(/);
  const partial = await discoverRecoveryOrders(async (method, params) => {
    if (method === 'arkiv_query' && params[0].includes('orders.v2')) throw new Error('down');
    return request(method, params);
  }, maker.address);
  assert.equal(partial.failedSchemas, 1); assert.equal(partial.orders.length, 1);
  let pages = 0;
  const capped = await discoverRecoveryOrders(async (method, params) => {
    if (method === 'eth_chainId') return request(method, params);
    pages++; return { blockNumber: '0x100', data: Array(25).fill(recoveryEntity(signed, params[0].includes('orders.v2') ? 2 : 1)) };
  }, maker.address);
  assert.equal(capped.truncated, true); assert.equal(pages, 4);
  await assert.rejects(discoverRecoveryOrders(async () => '0x1', maker.address), /Rabdi/);
  await assert.rejects(discoverRecoveryOrders(request, maker.address, () => { throw new Error('changed'); }), /changed/);
});

test('RPC transport omits credentials/referrer, bounds payloads, and never reflects provider errors or keys', async () => {
  let init;
  const request = recoveryRequest('https://example.org/?key=secret', async (_url, options) => {
    init = options; return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }));
  });
  assert.equal(await request('eth_chainId', []), '0x1');
  assert.equal(init.credentials, 'omit'); assert.equal(init.referrerPolicy, 'no-referrer');
  for (const response of [new Response('x'.repeat(1_500_001)),
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'secret' } })),
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 9, result: '0x1' }))]) {
    await assert.rejects(recoveryRequest('https://example.org/?key=secret', async () => response)('eth_chainId', []), error =>
      /Arkiv could not be read/.test(error.message) && !/secret/.test(error.message));
  }
});

test('a forged v2 signature cannot hide a valid v1 signature with the same order hash', async () => {
  const parsed = parseSignedSale(signed, d);
  const forged = { ...signed, signature: await stranger.signTypedData(seaportTypedData(d, parsed.order)) };
  const found = await discoverRecoveryOrders(async (method, params) => method === 'eth_chainId'
    ? `0x${arkivRecovery.chainId.toString(16)}` : { blockNumber: '0x123',
      data: params[0].includes('orders.v2') ? [recoveryEntity(forged, 2)] : [recoveryEntity(signed, 1)] }, maker.address);
  assert.equal(found.orders.length, 2);
  const checks = await Promise.allSettled(found.orders.map(order => verifyRecoveredOrder(reader(), order, 1, block)));
  assert.equal(checks[0].status, 'rejected'); assert.equal(checks[1].status, 'fulfilled');
});


test('V2 WISE/WETH/USDC records use the pinned zone, signatures and exact currency decimals', async () => {
  for (const token of paymentTokens) {
    const order = { ...base, currency: token.address, amount: (2n * 10n ** BigInt(token.decimals)).toString() };
    const parsed = parseSignedSale({ order, signature: '0x00' }, backupDeployments.v2);
    const signed = { order, signature: await maker.signTypedData(seaportTypedData(backupDeployments.v2, parsed.order)) };
    const record = parseRecoveryEntity(recoveryEntity(signed, 2, 'v2'), 2, maker.address, 1n);
    assert.equal(record.deploymentId, 'v2');
    const client = reader({ readContract: async req => req.functionName === 'getOrderHash' ? record.hash : reader().readContract(req) });
    assert.equal((await verifyRecoveredOrder(client, record, 1, block)).state, 'open');
    const portable = createBackupFile(maker.address, [{ signed, deploymentId: 'v2' }, { signed: await signedOrder(), deploymentId: 'v1' }]);
    const groups = parseBackupFile(JSON.parse(JSON.stringify(portable)), maker.address);
    assert.equal(groups.length, 2);
    assert.equal(groups[1].adapter, backupDeployments.v2.adapter);
    assert.equal(groups[1].orders[0].order.amount, order.amount);
    const forged = recoveryEntity(signed, 2, 'v2');
    forged.attributes.find(a => a.name === 'currencyDecimals').value = '0x0';
    assert.throws(() => parseRecoveryEntity(forged, 2, maker.address, 1n));
    await assert.rejects(verifyRecoveredOrder(client, { ...record, deploymentId: 'v1' }, 1, block));
  }
});

test('published snapshots arrive before Ethereum and survive an outage without enabling actions', async () => {
  const updates = []; let reachedRpc = false;
  const entries = await verifyRecoveryEntries([recovered], () => {
    assert.equal(updates.length, 1, 'publish snapshots before requesting Ethereum');
    reachedRpc = true; throw Error('RPC offline');
  }, () => {}, entries => updates.push(entries));
  assert.equal(reachedRpc, true);
  assert.equal(updates[0][0].verification, 'pending');
  assert.equal(entries[0].verification, 'unavailable');
  assert.equal(entries[0].signed.order.amount, signed.order.amount);
  assert.equal(canCancelRecovered(entries[0], maker.address), false);
  assert.equal(canExportRecovered(entries[0], maker.address), false);
  assert.equal(canCancelRecovered(updates[0][0], maker.address), false);
});

test('retry verifies retained records; forged variants cannot hide a valid order or enable actions', async () => {
  const parsed = parseSignedSale(signed, d);
  const forged = { ...recovered, version: 2, signed: { ...signed, signature: await stranger.signTypedData(seaportTypedData(d, parsed.order)) } };
  const valid = { ...recovered, version: 1 };
  const entries = await verifyRecoveryEntries([forged, valid], () => reader(), () => {}, () => {}, async () => block);
  assert.equal(entries[0].verification, 'failed');
  assert.equal(canCancelRecovered(entries[0], maker.address), false);
  const visible = visibleRecoveryEntries(entries);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].verification, 'verified');
  assert.equal(canCancelRecovered(visible[0], maker.address), true);
  assert.equal(canExportRecovered(visible[0], maker.address), true);
  assert.equal(canCancelRecovered(visible[0], stranger.address), false);
  assert.equal(canCancelRecovered(visible[0]), false);
  assert.equal(canCancelRecovered({ ...visible[0], status: { ...visible[0].status, state: 'cancelled' } }, maker.address), false);
  assert.equal(canCancelRecovered(recoverySnapshots(visible, 'unavailable')[0], maker.address), false);
});

test('changed lookup during verification cannot apply a stale verified result', async () => {
  let current = true; const updates = [];
  await assert.rejects(verifyRecoveryEntries([recovered], () => reader(), () => {
    if (!current) throw Error('lookup changed');
  }, entries => updates.push(entries), async () => { current = false; return block; }), /lookup changed/);
  assert.equal(updates.length, 1);
  assert.equal(updates[0][0].verification, 'pending');
});

test('backup bundles reject unknown deployments, wrong account, duplicate groups and oversized totals', () => {
  const one = createBackup(maker.address, [signed]);
  for (const groups of [[one, one], [{ ...one, adapter: stranger.address }], [{ ...one, account: stranger.address }], []])
    assert.throws(() => parseBackupFile({ format: 'wiseone.garuda.backup-bundle', version: 1, groups }, maker.address));
  assert.throws(() => parseBackupFile({ format: 'wiseone.garuda.backup-bundle', version: 2, groups: [one] }, maker.address));
  const many = (count, deploymentId) => createBackup(maker.address, Array.from({ length: count }, (_, i) => ({ ...signed, order: { ...signed.order, nonce: String(i + 1) } })), deploymentId);
  assert.throws(() => parseBackupFile({ format: 'wiseone.garuda.backup-bundle', version: 1, groups: [many(51, 'v1'), many(50, 'v2')] }, maker.address), /too many orders/);
});
