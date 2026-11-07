import { stringToHex } from 'viem';
import { arkivRecovery, recoveryScopes } from '../../src/lib/backup/arkiv.ts';
import { backupDeployments } from '../../src/lib/backup/core.ts';
import { paymentToken } from '../../src/lib/blend/payment-tokens.ts';
import { parseSignedSale } from '../../src/lib/blend/sales.ts';

// RPC wire fixture, including typed attributes rather than decoded SDK values.
export function recoveryEntity(signed, version = 2, deploymentId = 'v1') {
  const o = signed.order;
  const attributes = [];
  const attr = (name, type, value) => attributes.push({ name, type,
    value: type === 'u64' || type === 'u256' ? `0x${BigInt(value).toString(16)}` : value });
  attr('arkiv.schema', 'str', `wiseone.garuda.orders.v${version}`);
  attr('scope', 'str', recoveryScopes[deploymentId]);
  attr('orderHash', 'str', parseSignedSale(signed, backupDeployments[deploymentId]).hash);
  attr('kind', 'str', o.kind === 0 ? 'listing' : 'bid');
  attr('format', 'str', 'seaport-1.6');
  attr('envelope', 'bytes', stringToHex(JSON.stringify(signed)));
  attr('expires', 'u64', o.deadline);
  for (const name of ['maker', 'collection']) attr(name, version === 1 ? 'str' : 'addr', o[name].toLowerCase());
  attr(version === 1 ? 'owner' : 'stakeOwner', version === 1 ? 'str' : 'addr', o.owner.toLowerCase());
  attr('tokenId', version === 1 ? 'str' : 'u256', o.tokenId);
  if (version === 2) {
    attr('chainId', 'u64', 1); attr('currency', 'addr', o.currency);
    const token = paymentToken(o.currency);
    attr('currencySymbol', 'str', token.symbol); attr('currencyDecimals', 'u64', token.decimals);
    attr('price', 'u256', o.amount); attr('stakeId', 'str', o.stakeId);
    attr('stateHash', 'str', o.stateHash); attr('orderStartAt', 'u64', o.startTime);
  }
  return { key: `0x${'ab'.repeat(32)}`, owner: arkivRecovery.publisher, expiresAt: '0xfffffff', attributes };
}
