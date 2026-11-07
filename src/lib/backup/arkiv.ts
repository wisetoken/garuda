// SPDX-License-Identifier: MIT
// Small read-only implementation of Arkiv 1.0.1's documented JSON-RPC protocol.
// No publishing key, application API, or Arkiv wallet SDK belongs in this bundle.
import { getAddress, hexToString, keccak256, parseAbi, recoverTypedDataAddress, stringToBytes,
  type Address, type Hex, type PublicClient } from 'viem';
import { backupDeployment as deployment, backupDeployments, parseRpcUrl, verifyBackupContracts, type BackupDeploymentId } from './core';
import { paymentToken } from '../blend/payment-tokens';
import { deploymentScope, parseSignedSale, sameAddress, type SignedSale } from '../blend/sales';
import { seaportAbi, seaportComponents, seaportDigest, seaportTypedData } from '../blend/seaport';

export const arkivRecovery = {
  rpc: 'https://rpc.rabdi.db-chain.testnet.arkiv.network', chainId: 7794095,
  publisher: '0x8d5b491D2c843F6B996De1EC66269809138cA60A' as Address,
  scope: keccak256(stringToBytes(deploymentScope(deployment))), pageSize: 25, maxPages: 2,
} as const;
export const recoveryScopes = Object.fromEntries(Object.entries(backupDeployments).map(([id, d]) =>
  [id, keccak256(stringToBytes(deploymentScope(d)))])) as Record<BackupDeploymentId, Hex>;
type Version = 1 | 2;
export type RecoveredOrder = {
  signed: SignedSale; hash: Hex; entityKey: Hex; version: Version;
  relation: 'own' | 'incoming'; expiresAtBlock: bigint;
  deploymentId: BackupDeploymentId;
};
export type RecoveryStatus = {
  state: 'cancelled' | 'filled' | 'counter-invalidated' | 'expired' | 'not-started' | 'open';
  blockNumber: bigint;
};
export type RecoveryRequest = (method: 'eth_chainId' | 'arkiv_query', params: unknown[]) => Promise<unknown>;
function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Malformed Arkiv response.');
  return raw as Record<string, unknown>;
}
function quantity(raw: unknown): bigint {
  if (typeof raw !== 'string' || !/^0x[0-9a-f]{1,64}$/i.test(raw)) throw new Error('Malformed Arkiv quantity.');
  return BigInt(raw);
}
function address(raw: unknown): Address {
  if (typeof raw !== 'string' || !/^0x[0-9a-f]{40}$/i.test(raw)) throw new Error('Malformed address.');
  return getAddress(raw.toLowerCase());
}
function key(raw: unknown): Hex {
  if (typeof raw !== 'string' || !/^0x[0-9a-f]{64}$/i.test(raw)) throw new Error('Malformed entity key.');
  return raw.toLowerCase() as Hex;
}
const fields = ['arkiv.schema', 'scope', 'orderHash', 'maker', 'owner', 'stakeOwner', 'kind', 'collection',
  'tokenId', 'format', 'expires', 'envelope', 'chainId', 'currency', 'currencySymbol', 'currencyDecimals',
  'price', 'stakeId', 'stateHash', 'orderStartAt'];

/** Attributes are untrusted search hints; every displayed term comes from the signed envelope. */
export function parseRecoveryEntity(raw: unknown, version: Version, account: Address, blockNumber: bigint): RecoveredOrder {
  const entity = object(raw);
  if (!sameAddress(address(entity.owner), arkivRecovery.publisher)) throw new Error('Unexpected publisher.');
  const expiresAtBlock = quantity(entity.expiresAt);
  if (expiresAtBlock <= blockNumber) throw new Error('Entity storage has expired.');
  if (!Array.isArray(entity.attributes) || entity.attributes.length > 64) throw new Error('Invalid attributes.');
  const attrs = new Map<string, { type: string; value: unknown }>();
  for (const rawAttr of entity.attributes) {
    const attr = object(rawAttr);
    if (typeof attr.name !== 'string' || typeof attr.type !== 'string' || attrs.has(attr.name)) throw new Error('Invalid or repeated attribute.');
    attrs.set(attr.name, { type: attr.type, value: attr.value });
  }
  const value = (name: string, type: string) => {
    const attr = attrs.get(name);
    if (!attr || attr.type !== type) throw new Error('Missing or mistyped order attribute.');
    return attr.value;
  };
  const matches = (name: string, type: string, expected: string | bigint) => {
    const rawValue = value(name, type);
    const actual = type === 'u64' || type === 'u256' ? quantity(rawValue)
      : type === 'addr' ? address(rawValue).toLowerCase() : rawValue;
    if (actual !== (type === 'addr' ? String(expected).toLowerCase() : expected)) throw new Error('Order attributes do not match the signed terms.');
  };
  const envelope = value('envelope', 'bytes');
  if (typeof envelope !== 'string' || envelope.length > 40_002 || !/^0x(?:[0-9a-f]{2})+$/i.test(envelope)) throw new Error('Invalid order envelope.');
  const scope = value('scope', 'str');
  const deploymentId = (Object.keys(recoveryScopes) as BackupDeploymentId[]).find(id => recoveryScopes[id] === scope);
  if (!deploymentId) throw new Error('Unsupported recovery scope.');
  const parsed = parseSignedSale(JSON.parse(hexToString(envelope as Hex)), backupDeployments[deploymentId]), o = parsed.order;
  matches('arkiv.schema', 'str', `wiseone.garuda.orders.v${version}`);
  matches('scope', 'str', recoveryScopes[deploymentId]);
  matches('orderHash', 'str', parsed.hash);
  matches('format', 'str', 'seaport-1.6');
  matches('kind', 'str', o.kind === 0 ? 'listing' : 'bid');
  matches('expires', 'u64', o.deadline);
  matches('maker', version === 1 ? 'str' : 'addr', o.maker.toLowerCase());
  matches('collection', version === 1 ? 'str' : 'addr', o.collection.toLowerCase());
  if (version === 1) {
    matches('owner', 'str', o.owner.toLowerCase());
    matches('tokenId', 'str', String(o.tokenId));
  } else {
    matches('stakeOwner', 'addr', o.owner);
    matches('tokenId', 'u256', o.tokenId);
    matches('chainId', 'u64', 1n);
    matches('currency', 'addr', o.currency);
    const token = paymentToken(o.currency);
    matches('currencySymbol', 'str', token.symbol);
    matches('currencyDecimals', 'u64', BigInt(token.decimals));
    matches('price', 'u256', o.amount);
    matches('stakeId', 'str', o.stakeId);
    matches('stateHash', 'str', o.stateHash);
    matches('orderStartAt', 'u64', o.startTime);
  }
  const relation = sameAddress(o.maker, account) ? 'own' : o.kind === 1 && sameAddress(o.owner, account) ? 'incoming' : undefined;
  if (!relation) throw new Error('Order does not concern this wallet.');
  return { signed: parsed.signed, hash: parsed.hash, version, relation, entityKey: key(entity.key), expiresAtBlock, deploymentId };
}

/** Explicit opt-in network request with bounded response, no cookies, referrer, or persisted key. */
export function recoveryRequest(endpoint: string, fetcher: typeof fetch = fetch): RecoveryRequest {
  const url = parseRpcUrl(endpoint);
  return async (method, params) => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetcher(url, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let bytes = 0, text = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1_500_000) { controller.abort(); throw new Error(); }
          text += decoder.decode(value, { stream: true });
        }
      } finally { reader.releaseLock(); }
      const reply = object(JSON.parse(text + decoder.decode()));
      if (reply.jsonrpc !== '2.0' || reply.id !== 1 || reply.error || !('result' in reply)) throw new Error();
      return reply.result;
    } catch { throw new Error('Arkiv could not be read. Check the selected Rabdi RPC, or use a saved order file or counter cancellation.'); }
    finally { clearTimeout(timeout); }
  };
}

export async function discoverRecoveryOrders(request: RecoveryRequest, account: Address, assertCurrent = () => {}) {
  const who = address(account).toLowerCase();
  if (quantity(await request('eth_chainId', [])) !== BigInt(arkivRecovery.chainId)) throw new Error('The Arkiv RPC must use the Rabdi network.');
  const orders = new Map<string, RecoveredOrder>();
  let rejected = 0, truncated = false, failedSchemas = 0;
  const blocks: bigint[] = [];
  // Prefer v2, but always read v1: published orders can outlive a schema rollout.
  for (const version of [2, 1] as const) {
    for (let page = 0; page < arkivRecovery.maxPages; page++) {
      assertCurrent();
      const maker = version === 1 ? `maker = str('${who}')` : `maker = addr(${who})`;
      const owner = version === 1 ? `owner = str('${who}')` : `stakeOwner = addr(${who})`;
      const scopes = Object.values(recoveryScopes).map(scope => `scope = str('${scope}')`).join(' OR ');
      const query = `arkiv.schema = str('wiseone.garuda.orders.v${version}') AND (${scopes}) AND $owner = addr(${arkivRecovery.publisher}) AND (${maker} OR (${owner} AND kind = str('bid'))) ORDER BY $key:key ASC`;
      let result: Record<string, unknown>;
      try {
        result = object(await request('arkiv_query', [query, { select: { key: true, owner: true, expiresAt: true,
          attributes: Object.fromEntries(fields.map(name => [name, true])) },
          limit: '0x19', offset: `0x${(page * arkivRecovery.pageSize).toString(16)}` }]));
        quantity(result.blockNumber);
        if (!Array.isArray(result.data) || result.data.length > arkivRecovery.pageSize) throw new Error();
      } catch { failedSchemas++; break; }
      assertCurrent();
      const blockNumber = quantity(result.blockNumber), entities = result.data as unknown[];
      blocks.push(blockNumber);
      for (const entity of entities) {
        try {
          const parsed = parseRecoveryEntity(entity, version, account, blockNumber);
          // A bad signature on one version must not hide a valid signature on another.
          const identity = `${parsed.hash}:${parsed.signed.signature.toLowerCase()}`;
          if (!orders.has(identity)) orders.set(identity, parsed);
        } catch { rejected++; }
      }
      if (entities.length < arkivRecovery.pageSize) break;
      if (page === arkivRecovery.maxPages - 1) truncated = true;
    }
  }
  return { orders: [...orders.values()], rejected, truncated, failedSchemas, blocks };
}

const signatureAbi = parseAbi(['function isValidSignature(bytes32,bytes) view returns(bytes4)']);
type Reader = Pick<PublicClient, 'getChainId' | 'getBlock' | 'getCode' | 'readContract' | 'call' | 'waitForTransactionReceipt'>;
export async function verifyRecoveredOrder(client: Reader, recovered: RecoveredOrder, chainId: 1 | 31337 = 1,
  block?: { number: bigint; timestamp: bigint }): Promise<RecoveryStatus> {
  // Callers checking a batch may pass the one block already checked with verifyBackupContracts.
  const at = block ?? await verifyBackupContracts(client, chainId);
  const d = { ...backupDeployments[recovered.deploymentId], chainId }, parsed = parseSignedSale(recovered.signed, d), o = parsed.order;
  if (parsed.hash !== recovered.hash) throw new Error('Order identity changed.');
  const code = await client.getCode({ address: o.maker, blockNumber: at.number });
  let verified = false;
  if (code && code !== '0x') {
    verified = await client.readContract({ address: o.maker, abi: signatureAbi, functionName: 'isValidSignature',
      args: [seaportDigest(d, o), parsed.signed.signature], blockNumber: at.number }) === '0x1626ba7e';
  } else {
    verified = sameAddress(await recoverTypedDataAddress({ ...seaportTypedData(d, o), signature: parsed.signed.signature }), o.maker);
  }
  if (!verified) throw new Error('The maker signature could not be verified.');
  const [hash, counter, status] = await Promise.all([
    client.readContract({ address: d.market, abi: seaportAbi, functionName: 'getOrderHash', args: [seaportComponents(d, o)], blockNumber: at.number }),
    client.readContract({ address: d.market, abi: seaportAbi, functionName: 'getCounter', args: [o.maker], blockNumber: at.number }),
    client.readContract({ address: d.market, abi: seaportAbi, functionName: 'getOrderStatus', args: [parsed.hash], blockNumber: at.number }),
  ]);
  if (hash !== parsed.hash) throw new Error('Ethereum order hash mismatch.');
  return { blockNumber: at.number, state: status[1] ? 'cancelled' : status[2] > 0n ? 'filled'
    : counter !== o.counter ? 'counter-invalidated' : o.deadline <= at.timestamp ? 'expired'
    : o.startTime > at.timestamp ? 'not-started' : 'open' };
}
