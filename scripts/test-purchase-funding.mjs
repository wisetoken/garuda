import test from 'node:test';
import assert from 'node:assert/strict';
import { zeroAddress } from 'viem';
import { purchaseShortfall, quotePurchaseFunding, executePurchaseFunding, validatePurchaseFunding } from '../src/lib/market/purchase-funding.ts';
import { FUNDING_WISE, FUNDING_WETH, FUNDING_ROUTER, fundingTokens, fundingPath } from '../src/lib/blend/wise-funding.ts';
const buyer = '0x1111111111111111111111111111111111111111';
const orderHash = `0x${'ab'.repeat(32)}`;
function quote(token = zeroAddress) {
  return { buyer, orderHash, shortfall: 1000n, swap: { token, amount: 125n, output: 1006n, minimum: 1000n, slippage: 50, path: fundingPath(token), block: 1n, expires: Date.now() + 120000 } };
}
function harness(overrides = {}) {
  const writes = [], hashes = [], confirmed = [], phases = [], reads = [];
  const client = {
    getChainId: async () => 1, getBalance: async () => 999999n,
    readContract: async request => {
      reads.push(request);
      if (request.functionName === 'balanceOf') return 999999n;
      if (request.functionName === 'allowance') return 0n;
      throw Error(`Unexpected read: ${request.functionName}`);
    },
    simulateContract: async request => ({ request }),
    waitForTransactionReceipt: async () => ({ status: 'success' }),
    ...overrides,
  };
  const session = { client, address: buyer, guard: async () => {}, onStep: () => {},
    onHash: (hash, kind) => hashes.push({hash, kind}), onConfirmed: hash => confirmed.push(hash), onPhase: phase => phases.push(phase),
    wallet: { account: { address: buyer }, chain: { id: 1 }, getChainId: async () => 1,
      writeContract: async request => { writes.push(request); return `0x${String(writes.length).repeat(64)}`; } },
  };
  return {session, writes, hashes, confirmed, phases, reads};
}

test('purchase quote funds only the shortfall, including the slippage floor', async () => {
  const calls = [];
  const client = { getChainId: async () => 1, getBlockNumber: async () => 99n, readContract: async request => {
    calls.push(request);
    if (request.functionName === 'factory') return '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
    if (request.functionName === 'WETH') return FUNDING_WETH;
    return [125n, 1006n];
  } };
  for (const token of [zeroAddress, FUNDING_WETH, fundingTokens[2].address]) {
    const result = await quotePurchaseFunding(client, { token, buyer, orderHash, price: 1500n, balance: 500n, slippage: 50 });
    assert.equal(result.shortfall, 1000n);
    assert.equal(result.swap.minimum, 1000n);
    assert.deepEqual(result.swap.path, fundingPath(token));
    assert.equal(calls.findLast(x => x.functionName === 'getAmountsIn').args[0], 1006n);
  }
  assert.equal(purchaseShortfall(1000n, 1500n), 0n);
  await assert.rejects(quotePurchaseFunding(client, { token: zeroAddress, buyer, orderHash, price: 1000n, balance: 1000n, slippage: 50 }), /already have enough/);
  await assert.rejects(quotePurchaseFunding(client, { token: fundingTokens[3].address, buyer, orderHash, price: 1000n, balance: 0n, slippage: 50 }), /ETH, WETH or USDC/);
  const moved = { ...client, readContract: async r => r.functionName === 'getAmountsOut' ? [125n, 1000n] : client.readContract(r) };
  await assert.rejects(quotePurchaseFunding(moved, { token: zeroAddress, buyer, orderHash, price: 1500n, balance: 500n, slippage: 50 }), /quote moved/);
});

test('wallet, order, balance and route changes invalidate a purchase quote', () => {
  assert.throws(() => validatePurchaseFunding(quote(), zeroAddress, orderHash, 1000n), /Wallet or listing changed/);
  assert.throws(() => validatePurchaseFunding(quote(), buyer, `0x${'cd'.repeat(32)}`, 1000n), /Wallet or listing changed/);
  for (const shortfall of [0n, 999n, 1001n]) assert.throws(() => validatePurchaseFunding(quote(), buyer, orderHash, shortfall), /balance changed/);
  const invalid = quote(); invalid.swap.path = [FUNDING_WISE, FUNDING_WETH];
  assert.throws(() => validatePurchaseFunding(invalid, buyer, orderHash, 1000n), /cannot cover/);
});

test('ETH funding swaps to the buyer with a protected minimum and never buys the NFT', async () => {
  const h = harness(); let reviews = 0;
  await executePurchaseFunding(h.session, quote(), orderHash, async () => 1000n, async () => { reviews++; });
  assert.equal(reviews, 2);
  assert.equal(h.writes.length, 1);
  const tx = h.writes[0];
  assert.equal(tx.address, FUNDING_ROUTER); assert.equal(tx.functionName, 'swapExactETHForTokens');
  assert.equal(tx.value, 125n); assert.equal(tx.args[0], 1000n); assert.equal(tx.args[2], buyer);
  assert.equal(h.hashes[0].kind, 'Uniswap swap'); assert.equal(h.confirmed.length, 1);
  assert.deepEqual(h.phases, ['swapping', 'confirming']);
});

test('WETH and USDC approve only the quoted input before swapping', async () => {
  for (const token of [FUNDING_WETH, fundingTokens[2].address]) {
    const h = harness();
    await executePurchaseFunding(h.session, quote(token), orderHash, async () => 1000n, async () => {});
    assert.deepEqual(h.writes.map(x => x.functionName), ['approve', 'swapExactTokensForTokens']);
    assert.equal(h.writes[0].address, token); assert.deepEqual(h.writes[0].args, [FUNDING_ROUTER, 125n]);
    assert.deepEqual(h.writes[1].args.slice(0, 4), [125n, 1000n, fundingPath(token), buyer]);
    assert.equal(h.confirmed.length, 2);
  }
});

test('an unavailable listing or changed WISE balance after approval prevents a swap', async () => {
  for (const change of ['order', 'balance']) {
    const h = harness(); let reviews = 0;
    await assert.rejects(executePurchaseFunding(h.session, quote(FUNDING_WETH), orderHash,
      async () => change === 'balance' && h.writes.length ? 999n : 1000n,
      async () => { if (++reviews === 2 && change === 'order') throw Error('Order unavailable'); }), /unavailable|balance changed/);
    assert.deepEqual(h.writes.map(x => x.functionName), ['approve']);
  }
});

test('expired quote and changed network cannot request a transaction', async () => {
  const expired = quote(); expired.swap.expires = 0;
  const h = harness();
  await assert.rejects(executePurchaseFunding(h.session, expired, orderHash, async () => 1000n, async () => {}), /expired/);
  assert.equal(h.writes.length, 0);
  h.session.wallet.getChainId = async () => 10;
  await assert.rejects(executePurchaseFunding(h.session, quote(), orderHash, async () => 1000n, async () => {}), /network changed/);
  assert.equal(h.writes.length, 0);
});

test('receipt timeout leaves the submitted hash pending; revert resolves it without retrying', async () => {
  const timeout = harness({ waitForTransactionReceipt: async () => { throw Error('receipt timeout'); } });
  await assert.rejects(executePurchaseFunding(timeout.session, quote(), orderHash, async () => 1000n, async () => {}), /timeout/);
  assert.equal(timeout.hashes.length, 1); assert.equal(timeout.confirmed.length, 0); assert.equal(timeout.writes.length, 1);
  const reverted = harness({ waitForTransactionReceipt: async () => ({ status: 'reverted' }) });
  await assert.rejects(executePurchaseFunding(reverted.session, quote(FUNDING_WETH), orderHash, async () => 1000n, async () => {}), /Approval reverted/);
  assert.equal(reverted.confirmed.length, 1); assert.equal(reverted.writes.length, 1);
});
