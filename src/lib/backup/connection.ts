import { createPublicClient, custom, http, type EIP1193Provider } from 'viem';
import { mainnet } from 'viem/chains';
import { parseRpcUrl } from './core';
import { privateReadSession } from '../private-rpc';

/** Read selection never changes the wallet transport used for signing/submission. */
export function backupReadTransport({ selection, provider, rpcUrl = '', privateRequest = privateReadSession.request }: {
  selection: string;
  provider?: EIP1193Provider;
  rpcUrl?: string;
  privateRequest?: typeof privateReadSession.request;
}) {
  if (selection === 'nym') return custom({ request: privateRequest }, { retryCount: 0 });
  if (selection === 'wallet') {
    if (!provider) throw new Error('Connect an external wallet first.');
    return custom(provider, { retryCount: 0 });
  }
  return http(parseRpcUrl(selection === 'custom' ? rpcUrl : selection), {
    retryCount: 0, timeout: 20_000, fetchOptions: { credentials: 'omit', referrerPolicy: 'no-referrer' },
  });
}

export function backupReadClient(options: Parameters<typeof backupReadTransport>[0]) {
  return createPublicClient({ chain: mainnet, transport: backupReadTransport(options), cacheTime: 0,
    // A gateway URL returned by an RPC must not bypass the chosen private route.
    ccipRead: options.selection === 'nym' ? false : undefined });
}
