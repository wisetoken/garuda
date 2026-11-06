// All mutations occur on a disposable loopback Anvil fork, using synthetic accounts.
import assert from 'node:assert/strict';
import { parseEther, parseAbi, parseEventLogs, zeroAddress } from 'viem';
import { marketFixture } from './fork/market-fixture.mjs';
import { executeBackupAction, readBackupState, backupDeployment as d, backupNftAbi,
  createBackup, parseBackup } from '../src/lib/backup/core.ts';
import { publishSale } from '../src/lib/blend/sales-wallet.ts';
import { marketAbi, parseSignedSale } from '../src/lib/blend/sales.ts';
import { saleSettlement } from '../src/lib/blend/seaport.ts';
import { discoverRecoveryOrders, verifyRecoveredOrder, arkivRecovery } from '../src/lib/backup/arkiv.ts';
import { recoveryEntity } from './fixtures/arkiv-recovery.mjs';

const f = await marketFixture();
const wallet = f.seller, address = wallet.account.address;
let sent = 0;
const session = {
  client: f.client, account: address, chainId: 31337, assertCurrent() {},
  wallet: { ...wallet, sendTransaction: request => { sent++; return wallet.sendTransaction({ ...request, account: wallet.account }); } },
};
const sign = (id, nonce) => publishSale(f.session(wallet), { kind: 0, tokenId: id, amount: parseEther('1000'), days: 7, nonce }, async () => {});
const rawFill = async signed => {
  const parsed = parseSignedSale(signed, f.deployment);
  return f.client.simulateContract({ ...saleSettlement(f.deployment, parsed.order, signed.signature, f.buyer.account.address), account: f.buyer.account.address });
};
try {
  // No Garuda service or indexer is started. Block all fetch requests except this fork.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, new URL(f.deployment.rpcUrl).origin, `Unexpected dependency: ${url.origin}`);
    return originalFetch(input, init);
  };
  try {
    const initial = await readBackupState(f.client, address, 31337);
    assert.ok(initial.portfolio.positions.find(p => p.tokenId === '20'));
    const redeemable = initial.portfolio.positions.find(p => p.status === 'Mature');
    assert.ok(redeemable, 'A live matured Signature fixture is required');
    const targetId = BigInt(redeemable.tokenId);
    console.log(`Using matured Signature #${targetId}; no future clock jump required`);
    console.log('PASS fresh inventory uses only the local Ethereum fork; no API/indexer/config cache');
    // A newly minted stake is deterministically not mature, regardless of live fixture age.
    await f.receipt(await wallet.writeContract({ address: d.currency, abi: f.tokenAbi, functionName: 'approve', args: [d.collection, parseEther('10')] }));
    const minted = await f.receipt(await wallet.writeContract({ address: d.collection,
      abi: parseAbi(['function mint(uint256,uint64,address)']), functionName: 'mint', args: [parseEther('10'), 30n, zeroAddress] }));
    const mintedId = parseEventLogs({ abi: backupNftAbi, logs: minted.logs, eventName: 'Transfer' })
      .find(log => log.address.toLowerCase() === d.collection.toLowerCase() && log.args.from === zeroAddress).args.tokenId;
    const before = sent;
    await assert.rejects(executeBackupAction(session, { kind: 'redeem', tokenId: mintedId }), /Only a verified, matured/);
    assert.equal(sent, before, 'Active stake never requests a transaction');

    await f.receipt(await f.buyer.writeContract({ address: d.currency, abi: f.tokenAbi, functionName: 'approve', args: [d.market, parseEther('10000')] }));
    const order = await sign(targetId, 901n);
    await rawFill(order); // Establish this exact order could execute before cancellation.
    // Synthetic Arkiv response avoids publishing fork signatures; all validation and Ethereum calls are real.
    const discovery = await discoverRecoveryOrders(async (method, params) => method === 'eth_chainId'
      ? `0x${arkivRecovery.chainId.toString(16)}` : { blockNumber: '0x123',
        data: [recoveryEntity(order, params[0].includes('orders.v2') ? 2 : 1)] }, address);
    assert.equal(discovery.orders.length, 1);
    assert.equal((await verifyRecoveredOrder(f.client, discovery.orders[0], 31337)).state, 'open');
    const portable = parseBackup(JSON.parse(JSON.stringify(createBackup(address, discovery.orders.map(row => row.signed)))), address);
    await executeBackupAction(session, { kind: 'cancel', signed: portable.orders[0] });
    const hash = parseSignedSale(order, f.deployment).hash;
    assert.equal((await f.client.readContract({ address: d.market, abi: marketAbi, functionName: 'getOrderStatus', args: [hash] }))[1], true);
    await assert.rejects(rawFill(order));
    assert.equal((await verifyRecoveredOrder(f.client, discovery.orders[0], 31337)).state, 'cancelled');
    console.log('PASS Arkiv wire recovery, signature/status check, export/import and cancellation; previously executable settlement now reverts');

    const counterOrder = await sign(targetId, 902n);
    await rawFill(counterOrder);
    await executeBackupAction(session, { kind: 'counter' });
    await assert.rejects(rawFill(counterOrder));
    console.log('PASS counter invalidation rejects a previously executable order without a backup');

    await f.receipt(await wallet.writeContract({ address: d.currency, abi: f.tokenAbi, functionName: 'approve', args: [d.market, parseEther('100')] }));
    await f.receipt(await wallet.writeContract({ address: d.collection, abi: backupNftAbi, functionName: 'setApprovalForAll', args: [d.market, true] }));
    await executeBackupAction(session, { kind: 'revoke-wise' });
    await executeBackupAction(session, { kind: 'revoke-operator' });
    await executeBackupAction(session, { kind: 'revoke-nft', tokenId: targetId });
    const revoked = await readBackupState(f.client, address, 31337);
    assert.equal(revoked.allowance, 0n); assert.equal(revoked.operator, false);
    assert.equal(revoked.approvals.find(p => p.tokenId === String(targetId)).approved, zeroAddress);
    console.log('PASS WISE allowance, collection permission, and token approval are zero');

    // Ownership and session changes must fail before signing, even after earlier reads.
    const sentBeforeRace = sent;
    let checks = 0;
    await assert.rejects(executeBackupAction({ ...session, assertCurrent() { if (++checks >= 3) throw new Error('changed wallet'); } }, { kind: 'counter' }), /changed wallet/);
    assert.equal(sent, sentBeforeRace);
    await assert.rejects(executeBackupAction({ ...session, account: f.other.account.address }, { kind: 'redeem', tokenId: targetId }), /Wallet or network changed/);

    const balanceBefore = await f.balance(address);
    console.log(`Checking redemption of matured Signature #${targetId}…`);
    const result = await executeBackupAction({ ...session, onSubmitted: hash => console.log(`Fork redemption submitted: ${hash}`) }, { kind: 'redeem', tokenId: targetId });
    assert.ok(result.received > 0n);
    assert.equal(await f.balance(address) - balanceBefore, result.received);
    await assert.rejects(f.owner(targetId));
    assert.equal((await readBackupState(f.client, address, 31337)).portfolio.positions.some(p => p.tokenId === String(targetId)), false);
    console.log(`PASS matured Signature #${targetId} burned; ${result.received} base units WISE received; inventory no longer includes NFT`);
  } finally { globalThis.fetch = originalFetch; }
} catch (error) { console.error(error); throw error; } finally { await f.restore(); }
