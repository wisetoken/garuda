import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeErrorResult, keccak256, parseAbi } from 'viem';
import { createBackup, parseBackup, parseRpcUrl, executeBackupAction, backupDeployment as d } from '../src/lib/backup/core.ts';
import { buildBackup } from './build-backup.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { backupReadClient, backupReadTransport } from '../src/lib/backup/connection.ts';

const account = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
const signed = { signature: `0x${'11'.repeat(65)}`, order: {
  kind: 0, maker: account, owner: account, collection: d.collection, currency: d.currency,
  tokenId: '20', amount: '1000000000000000000', nonce: '1', epoch: '0', counter: '0',
  startTime: '1700000000', deadline: '1700086400', feeBps: d.feeBps, feeRecipient: d.feeRecipient,
  stakeId: `0x${'12'.repeat(16)}`, stateHash: `0x${'34'.repeat(32)}`,
}};

test('portable orders round-trip without cached configuration; reject wrong wallet, deployment, fields and duplicates', () => {
  const backup = createBackup(account, [signed]);
  assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(backup)), account), backup);
  for (const change of [{ chainId: 31337 }, { market: other }, { adapter: other }, { account: other },
    { version: 2 }, { orders: [signed, signed] }, { orders: [{ ...signed, order: { ...signed.order, currency: other } }] },
    { orders: [{ ...signed, order: { ...signed.order, extra: 'ignored?' } }] }, { orders: Array(101).fill(signed) }]) {
    assert.throws(() => parseBackup({ ...backup, ...change }, account));
  }
  assert.throws(() => parseBackup(backup, other));
});

test('custom RPC only permits HTTPS or local HTTP, without URL-authority credentials', () => {
  assert.equal(parseRpcUrl('https://example.org/rpc?key=user-owned'), 'https://example.org/rpc?key=user-owned');
  assert.equal(parseRpcUrl('http://127.0.0.1:8545'), 'http://127.0.0.1:8545/');
  for (const url of ['http://example.org', 'javascript:alert(1)', 'file:///tmp/key', 'https://user:pass@example.org', 'https://example.org/#fragment']) assert.throws(() => parseRpcUrl(url));
});

test('backup private reads use only the selected session, including failure', async () => {
  const calls = []; let walletCalls = 0, fail = false;
  const transport = backupReadTransport({ selection: 'nym',
    provider: { request: async () => { walletCalls++; throw Error('Must not reach wallet'); } },
    privateRequest: async request => { calls.push(request); if (fail) throw Error('Private route unavailable'); return '0x2'; },
  })({});
  const request = { method: 'eth_getBalance', params: [account, 'latest'] };
  assert.equal(await transport.request(request), '0x2');
  fail = true;
  await assert.rejects(transport.request(request), /Private route unavailable/);
  assert.deepEqual(calls, [request, request]);
  assert.equal(walletCalls, 0);
});

test('backup wallet mode does not start Nym, and requires an explicit provider', async () => {
  let starts = 0;
  const request = { method: 'eth_blockNumber' };
  const calls = [];
  const transport = backupReadTransport({ selection: 'wallet',
    provider: { request: async args => { calls.push(args); return '0x1234'; } },
    privateRequest: async () => { starts++; throw Error('Must not start Nym'); },
  })({});
  assert.equal(await transport.request(request), '0x1234');
  assert.deepEqual(calls, [request]);
  assert.equal(starts, 0);
  assert.throws(() => backupReadTransport({ selection: 'wallet' }), /Connect an external wallet/);
});

test('private backup client rejects offchain lookup redirects without a gateway fetch', async t => {
  let gatewayCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { gatewayCalls++; throw Error('Offchain read must stay blocked'); });
  const data = encodeErrorResult({ abi: parseAbi(['error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)']),
    errorName: 'OffchainLookup', args: [d.collection, ['https://gateway.invalid/{sender}/{data}'], '0x1234', '0x12345678', '0x'] });
  const client = backupReadClient({ selection: 'nym', privateRequest: async () => {
    throw Object.assign(new Error('execution reverted'), { code: 3, data });
  } });
  await assert.rejects(client.call({ to: d.collection, data: '0x1234' }));
  assert.equal(gatewayCalls, 0);
});

test('wrong chain, changed wallet, and substituted contract code never request a transaction', async () => {
  for (const failure of ['chain', 'account', 'code', 'session']) {
    let sent = 0;
    const session = {
      account, chainId: 1, assertCurrent() { if (failure === 'session') throw new Error('changed session'); },
      wallet: { getAddresses: async () => [failure === 'account' ? other : account], getChainId: async () => 1,
        sendTransaction: async () => { sent++; } },
      client: { getChainId: async () => failure === 'chain' ? 31337 : 1,
        getBlock: async () => ({ number: 1n, hash: keccak256('0x01') }), getCode: async () => '0x01' },
    };
    await assert.rejects(executeBackupAction(session, { kind: 'counter' }));
    assert.equal(sent, 0, `${failure} must not send`);
  }
});

test('backup builds are byte-identical, self-contained, CSP hash-pinned and contain no server or wallet SDK', async () => {
  const [first, second] = await Promise.all([buildBackup(), buildBackup()]);
  assert.equal(first.html, second.html);
  assert.equal(first.sha256, second.sha256);
  assert.equal(await readFile(new URL('../public/garuda-backup.html', import.meta.url), 'utf8'), first.html,
    'The shipped HTML must match current source; run npm run build:backup after edits');
  assert.match(first.html, /script-src 'sha256-/);
  const csp = first.html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const directives = Object.fromEntries(csp.split(';').map(part => part.trim().split(/\s+/)).filter(([key]) => key).map(([key, ...values]) => [key, values]));
  const script = first.html.match(/<script>([\s\S]*)<\/script>/)[1];
  const iframeBoot = await readFile(new URL(import.meta.resolve('@anon-rpc/browser-harness/iframe-boot.js')), 'utf8');
  const hashes = [script, iframeBoot].map(source => `'sha256-${createHash('sha256').update(source).digest('base64')}'`);
  assert.deepEqual(directives['script-src-elem'], [...hashes, 'blob:']);
  assert.deepEqual(directives['script-src'], [...hashes, 'blob:', "'wasm-unsafe-eval'"]);
  assert.deepEqual(directives['script-src-attr'], ["'none'"]);
  assert.deepEqual(directives['frame-src'], ["'self'"]);
  assert.deepEqual(directives['worker-src'], ['blob:']);
  assert.doesNotMatch(first.html, /<script[^>]+src=|<link[^>]+(?:stylesheet|preload)/i);
  assert.ok(first.inputs.every(path => !/node_modules\/(thirdweb|@arkiv-network)|server\//.test(path)));
  assert.doesNotMatch(first.html, /\/api\/garuda|analytics\.thirdweb|googletagmanager|posthog/i);
  // Fail closed if template placeholders accidentally survive packaging.
  assert.doesNotMatch(first.html, /__SCRIPT__|__CSP__/);
});

test('the pinned SDK event sender is the build-time opt-out boundary', async () => {
  const source = await readFile(new URL('../node_modules/thirdweb/dist/esm/analytics/track/index.js', import.meta.url), 'utf8');
  assert.match(source, /getThirdwebBaseUrl\("analytics"\)/);
  const { withoutWalletAnalytics } = await import('./no-analytics.ts');
  const plugin = withoutWalletAnalytics();
  const result = plugin.transform(source, '/node_modules/thirdweb/dist/esm/analytics/track/index.js');
  assert.equal(result.code, 'export async function track() {}');
  assert.equal(plugin.transform('functional request', '/node_modules/thirdweb/dist/esm/rpc/index.js'), undefined);
  const wc = await readFile(new URL('../node_modules/thirdweb/dist/esm/wallets/wallet-connect/controller.js', import.meta.url), 'utf8');
  assert.match(plugin.transform(wc, '/node_modules/thirdweb/dist/esm/wallets/wallet-connect/controller.js').code, /telemetryEnabled: false/);
});
