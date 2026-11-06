// Disposable local fork only. Never connects a signing wallet to an upstream RPC.
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient, formatUnits, http, parseAbi, parseEther, parseUnits, toHex } from 'viem';
import { paymentTokens } from '../src/lib/blend/payment-tokens.ts';
import { mainnet } from 'viem/chains';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { quotePurchaseFunding, executePurchaseFunding, purchaseFundingTokens, purchaseShortfall } from '../src/lib/market/purchase-funding.ts';
import { FUNDING_WISE, FUNDING_WETH, FUNDING_ROUTER, fundingRouterAbi, fundingTokenAbi } from '../src/lib/blend/wise-funding.ts';
const endpoint = 'http://127.0.0.1:18750';
const client = createPublicClient({ chain: mainnet, transport: http(endpoint),cacheTime:0,pollingInterval:100 });
const info = await client.request({ method: 'anvil_nodeInfo', params: [] });
assert.ok(info.forkConfig?.forkBlockNumber > 0, 'Requires an Anvil Ethereum fork');
assert.equal(await client.getChainId(), 1, 'Fork must retain Ethereum chain ID for production guards');
const version = await client.request({ method: 'web3_clientVersion', params: [] });
assert.match(version, /anvil/i);
const account = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ chain: mainnet, account, transport: http(endpoint) });
const orderHash = `0x${'ab'.repeat(32)}`;
const results = [];
for (const currency of paymentTokens) for (const token of purchaseFundingTokens.filter(t=>t.address!==currency.address)) {
  const snapshot = await client.request({ method: 'evm_snapshot', params: [] });
  try {
    await client.request({ method: 'anvil_setBalance', params: [account.address, toHex(parseEther('10'))] });
    if (token.symbol === 'WETH') {
      const hash = await wallet.writeContract({ address: FUNDING_WETH, abi: parseAbi(['function deposit() payable']), functionName: 'deposit', value: parseEther('1') });
      assert.equal((await client.waitForTransactionReceipt({ hash })).status, 'success');
    }
    if (token.symbol === 'USDC' || token.symbol === 'WISE') {
      const deadline = (await client.getBlock()).timestamp + 600n;
      const hash = await wallet.writeContract({ address: FUNDING_ROUTER, abi: fundingRouterAbi,
        functionName: 'swapExactETHForTokens', args: [1_000_000n, [FUNDING_WETH, token.address], account.address, deadline], value: parseEther('0.1') });
      assert.equal((await client.waitForTransactionReceipt({ hash })).status, 'success');
    }
    const readWise = () => client.readContract({ address: currency.address, abi: fundingTokenAbi, functionName: 'balanceOf', args: [account.address] });
    const missing = parseUnits(currency.symbol==='WETH'?'0.001':'20',currency.decimals);
    const initial = await readWise(), price = initial + missing;
    const quote = await quotePurchaseFunding(client, { currency:currency.address, token: token.address, buyer: account.address, orderHash, price, balance: initial, slippage: 50 });
    const txs = [], confirmed = []; let reviews = 0;
    await executePurchaseFunding({ client, wallet, address: account.address,
      guard: async () => { assert.equal(await wallet.getChainId(), 1); }, onStep: () => {},
      onHash: (hash, kind) => txs.push({ hash, kind }), onConfirmed: hash => confirmed.push(hash),
    }, quote, orderHash, async () => purchaseShortfall(price, await readWise()), async () => { reviews++; },currency.address);
    const received = await readWise() - initial;
    assert.ok(received >= missing); assert.ok(received >= quote.swap.minimum);
    assert.equal(reviews, 2); assert.equal(confirmed.length, txs.length);
    assert.equal(txs.length, token.symbol === 'ETH' ? 1 : 2);
    results.push({ token: token.symbol, paid: formatUnits(quote.swap.amount, token.decimals), paymentToken:currency.symbol, received: formatUnits(received, currency.decimals), transactions: txs.length });
  } finally { assert.equal(await client.request({ method: 'evm_revert', params: [snapshot] }), true); }
}
console.log(JSON.stringify({ forkBlock: info.forkConfig.forkBlockNumber, results, scope: 'Real Uniswap v2 swaps on an isolated local fork; listing revalidation callback is a test fixture; ETH to WETH uses direct wrapping. No mainnet transactions.' }, null, 2));
