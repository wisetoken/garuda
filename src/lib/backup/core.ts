// SPDX-License-Identifier: MIT
// This module has no API, storage, wallet SDK, or application-origin dependency.
import {
  encodeFunctionData, getAddress, isAddress, keccak256, parseAbi, parseEventLogs,
  zeroAddress, type Address, type Hex, type PublicClient, type WalletClient,
} from 'viem';
import manifest from '../../../scripts/fixtures/signature-market.json';
import { parseSalesDeployment, parseSignedSale, sameAddress, type SignedSale } from '../blend/sales';
import { seaportAbi, seaportComponents } from '../blend/seaport';
import { loadSignaturePortfolio } from '../blend/live-portfolio';

export const backupDeployment = parseSalesDeployment(manifest);
export const backupNftAbi = parseAbi([
  'function ownerOf(uint256) view returns(address)',
  'function getApproved(uint256) view returns(address)',
  'function isApprovedForAll(address,address) view returns(bool)',
  'function approve(address,uint256)',
  'function setApprovalForAll(address,bool)',
  'function burn(uint256)',
  'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)',
]);
export const backupTokenAbi = parseAbi([
  'function allowance(address,address) view returns(uint256)',
  'function approve(address,uint256) returns(bool)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
export type BackupEnvelope = {
  format: 'wiseone.garuda.backup'; version: 1; chainId: 1;
  market: Address; adapter: Address; account: Address; orders: SignedSale[];
};

// Imported files never choose a contract, RPC, ABI, or executable code.
export function parseBackup(raw: unknown, account: string): BackupEnvelope {
  if (!raw || typeof raw !== 'object') throw new Error('This is not a Garuda order backup.');
  const value = raw as BackupEnvelope;
  if (value.format !== 'wiseone.garuda.backup' || value.version !== 1 || value.chainId !== 1 ||
      typeof value.market !== 'string' || !sameAddress(value.market, backupDeployment.market) ||
      typeof value.adapter !== 'string' || !sameAddress(value.adapter, backupDeployment.adapter) ||
      typeof value.account !== 'string' || !isAddress(value.account, { strict: false }) ||
      !sameAddress(value.account, account) || !Array.isArray(value.orders) || value.orders.length > 100)
    throw new Error('Backup network, deployment, version, or connected wallet does not match.');
  const hashes = new Set<string>();
  const orders = value.orders.map(rawOrder => {
    const parsed = parseSignedSale(rawOrder, backupDeployment);
    if (!sameAddress(parsed.order.maker, account)) throw new Error('An order belongs to another wallet.');
    if (hashes.has(parsed.hash)) throw new Error('Duplicate order in backup.');
    hashes.add(parsed.hash);
    return parsed.signed;
  });
  return { format: 'wiseone.garuda.backup', version: 1, chainId: 1,
    market: backupDeployment.market, adapter: backupDeployment.adapter,
    account: getAddress(account.toLowerCase()), orders };
}
export function createBackup(account: string, orders: SignedSale[]): BackupEnvelope {
  return parseBackup({ format: 'wiseone.garuda.backup', version: 1, chainId: 1,
    market: backupDeployment.market, adapter: backupDeployment.adapter, account, orders }, account);
}
export function parseRpcUrl(value: string): string {
  const url = new URL(value.trim());
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.hash)
    throw new Error('Use an HTTPS RPC URL, or HTTP on localhost. Credentials in the URL authority are not supported.');
  return url.href;
}

export type BackupAction =
  | { kind: 'cancel'; signed: SignedSale }
  | { kind: 'counter' }
  | { kind: 'revoke-wise' }
  | { kind: 'revoke-operator' }
  | { kind: 'revoke-nft'; tokenId: bigint }
  | { kind: 'redeem'; tokenId: bigint };
type Reader = Pick<PublicClient, 'getChainId' | 'getBlock' | 'getCode' | 'readContract' | 'call' | 'waitForTransactionReceipt'>;
export type BackupSession = {
  client: Reader; wallet: Pick<WalletClient, 'getChainId' | 'getAddresses' | 'sendTransaction' | 'chain'>;
  account: Address; chainId: 1 | 31337; assertCurrent: () => void;
  onSubmitted?: (hash: Hex) => void;
};

export async function verifyBackupContracts(client: Reader, chainId: 1 | 31337 = 1) {
  if (await client.getChainId() !== chainId) throw new Error('The RPC is connected to the wrong network.');
  const block = await client.getBlock();
  if (block.number === null || !block.hash) throw new Error('A mined Ethereum block is required.');
  const d = backupDeployment;
  // Pin only contracts used by the escape path; a paused or missing market API/zone does not block exits.
  await Promise.all([
    [d.market, d.marketCodeHash], [d.collection, d.collectionCodeHash], [d.currency, d.currencyCodeHash],
  ].map(async ([address, expected]) => {
    const code = await client.getCode({ address: address as Address, blockNumber: block.number! });
    if (!code || code === '0x' || keccak256(code) !== expected)
      throw new Error('Contract code does not match this backup release. No transaction was requested.');
  }));
  return block;
}
export async function readBackupState(client: Reader, account: Address, chainId: 1 | 31337 = 1) {
  await verifyBackupContracts(client, chainId);
  const d = backupDeployment;
  const [portfolio, counter, allowance, operator] = await Promise.all([
    loadSignaturePortfolio(client, account, chainId, d.collection),
    client.readContract({ address: d.market, abi: seaportAbi, functionName: 'getCounter', args: [account] }),
    client.readContract({ address: d.currency, abi: backupTokenAbi, functionName: 'allowance', args: [account, d.market] }),
    client.readContract({ address: d.collection, abi: backupNftAbi, functionName: 'isApprovedForAll', args: [account, d.market] }),
  ]);
  const approvals = await Promise.all(portfolio.positions.map(async position => ({
    tokenId: position.tokenId,
    approved: await client.readContract({ address: d.collection, abi: backupNftAbi,
      functionName: 'getApproved', args: [BigInt(position.tokenId)], blockNumber: portfolio.blockNumber }),
  })));
  return { portfolio, counter, allowance, operator, approvals };
}

async function guard(session: BackupSession) {
  session.assertCurrent();
  const [addresses, chain] = await Promise.all([session.wallet.getAddresses(), session.wallet.getChainId()]);
  if (!addresses[0] || !sameAddress(addresses[0], session.account) || chain !== session.chainId)
    throw new Error('Wallet or network changed. Reconnect and review the action again.');
  session.assertCurrent();
}

/** Fresh state and simulation are required even when the UI previously showed an available action. */
export async function executeBackupAction(session: BackupSession, action: BackupAction) {
  await guard(session);
  await verifyBackupContracts(session.client, session.chainId);
  const { client, account } = session;
  const d = backupDeployment;
  let to: Address = d.market;
  let data: Hex;
  let beforeCounter: bigint | undefined;
  let orderHash: Hex | undefined;
  if (action.kind === 'cancel') {
    const parsed = parseSignedSale(action.signed, d);
    if (!sameAddress(parsed.order.maker, account)) throw new Error('Only the signing wallet can cancel this order.');
    orderHash = parsed.hash;
    data = encodeFunctionData({ abi: seaportAbi, functionName: 'cancel', args: [[seaportComponents(d, parsed.order)]] });
  } else if (action.kind === 'counter') {
    beforeCounter = await client.readContract({ address: d.market, abi: seaportAbi, functionName: 'getCounter', args: [account] });
    data = encodeFunctionData({ abi: seaportAbi, functionName: 'incrementCounter' });
  } else if (action.kind === 'revoke-wise') {
    to = d.currency;
    data = encodeFunctionData({ abi: backupTokenAbi, functionName: 'approve', args: [d.market, 0n] });
  } else if (action.kind === 'revoke-operator') {
    to = d.collection;
    data = encodeFunctionData({ abi: backupNftAbi, functionName: 'setApprovalForAll', args: [d.market, false] });
  } else {
    to = d.collection;
    if (action.tokenId < 0n || action.tokenId >= 1n << 256n) throw new Error('Invalid Signature NFT ID.');
    const owner = await client.readContract({ address: to, abi: backupNftAbi, functionName: 'ownerOf', args: [action.tokenId] });
    if (!sameAddress(owner, account)) throw new Error('This wallet no longer owns the Signature NFT.');
    if (action.kind === 'redeem') {
      const result = await loadSignaturePortfolio(client, account, session.chainId, d.collection, [String(action.tokenId)]);
      const position = result.positions[0];
      if (!position || position.status !== 'Mature' || !position.canList)
        throw new Error('Only a verified, matured Signature stake can be redeemed here. Early ending is disabled.');
      data = encodeFunctionData({ abi: backupNftAbi, functionName: 'burn', args: [action.tokenId] });
    } else {
      data = encodeFunctionData({ abi: backupNftAbi, functionName: 'approve', args: [zeroAddress, action.tokenId] });
    }
  }
  await client.call({ account, to, data, value: 0n });
  await guard(session);
  const hash = await session.wallet.sendTransaction({ account, chain: session.wallet.chain ?? null, to, data, value: 0n });
  session.onSubmitted?.(hash);
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: session.chainId === 1 ? 2 : 1, timeout: 180_000,
    onReplaced: replacement => session.onSubmitted?.(replacement.transaction.hash) });
  if (receipt.status !== 'success') throw new Error('The transaction reverted. No action was completed.');
  const blockNumber = receipt.blockNumber;
  let confirmed = false;
  let received = 0n;
  if (action.kind === 'cancel') confirmed = (await client.readContract({ address: d.market, abi: seaportAbi,
    functionName: 'getOrderStatus', args: [orderHash!], blockNumber }))[1];
  if (action.kind === 'counter') confirmed = await client.readContract({ address: d.market, abi: seaportAbi,
    functionName: 'getCounter', args: [account], blockNumber }) > beforeCounter!;
  if (action.kind === 'revoke-wise') confirmed = await client.readContract({ address: d.currency, abi: backupTokenAbi,
    functionName: 'allowance', args: [account, d.market], blockNumber }) === 0n;
  if (action.kind === 'revoke-operator') confirmed = !(await client.readContract({ address: d.collection, abi: backupNftAbi,
    functionName: 'isApprovedForAll', args: [account, d.market], blockNumber }));
  if (action.kind === 'revoke-nft') confirmed = sameAddress(await client.readContract({ address: d.collection, abi: backupNftAbi,
    functionName: 'getApproved', args: [action.tokenId], blockNumber }), zeroAddress);
  if (action.kind === 'redeem') {
    const burned = parseEventLogs({ abi: backupNftAbi, logs: receipt.logs, eventName: 'Transfer' })
      .some(log => sameAddress(log.address, d.collection) && sameAddress(log.args.from, account) &&
        sameAddress(log.args.to, zeroAddress) && log.args.tokenId === action.tokenId);
    received = parseEventLogs({ abi: backupTokenAbi, logs: receipt.logs, eventName: 'Transfer' })
      .filter(log => sameAddress(log.address, d.currency) && sameAddress(log.args.to, account))
      .reduce((total, log) => total + log.args.value, 0n);
    confirmed = burned && received > 0n;
  }
  if (!confirmed) throw new Error(`Transaction ${hash} succeeded, but the expected result could not be verified. Check the receipt before retrying.`);
  return { hash, receipt, received };
}
