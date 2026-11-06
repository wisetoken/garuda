import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256 } from 'viem';
import { createBackup, parseBackup, parseRpcUrl, executeBackupAction, backupDeployment as d } from '../src/lib/backup/core.ts';
import { buildBackup } from './build-backup.mjs';
import { readFile } from 'node:fs/promises';

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
