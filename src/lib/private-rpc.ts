import { custom, toFunctionSelector } from 'viem';

// The official Nym specifier, not the non-private passthrough demo worker.
export const NYM_SPECIFIER = '0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0';
export const PRIVATE_RPC_ENDPOINT = 'https://ethereum-rpc.publicnode.com';
export const PRIVATE_READS_KEY = 'garuda:private-reads:v1';
const FAILURE = 'Private reads could not complete. No direct fallback was used. Retry the connection or explicitly select a direct read provider.';
const READ_METHODS = new Set(['eth_chainId', 'net_version', 'eth_blockNumber', 'eth_call', 'eth_getBalance',
  'eth_getCode', 'eth_getStorageAt', 'eth_getLogs', 'eth_getBlockByNumber', 'eth_getBlockByHash',
  'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getTransactionCount',
  'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory']);
const SPECIFIER_CALLS = new Set<string>([toFunctionSelector('workerHash()'), toFunctionSelector('workerResolvers()')]);
type RpcArgs = { method: string; params?: unknown };
type BootstrapProvider = { request: (args: RpcArgs) => Promise<unknown> };
type Worker = { ready: Promise<void>; fetch: typeof fetch; close: () => void };
export type PrivateReadStatus = { phase: 'idle' | 'starting' | 'ready' | 'error'; block?: string };

function storedPrivateReads() {
  try { return localStorage.getItem(PRIVATE_READS_KEY) === 'nym'; } catch { return false; }
}
// Freeze the mode for this page lifetime. Other tabs must reload to adopt a
// saved change; existing clients cannot silently mix old and new transports.
const enabledAtLoad = storedPrivateReads();
export function privateReadsEnabled() { return enabledAtLoad; }
/** Changing this setting requires a page reload so old clients/caches cannot cross modes. */
export function savePrivateReads(enabled: boolean) {
  localStorage.setItem(PRIVATE_READS_KEY, enabled ? 'nym' : 'direct');
  if (storedPrivateReads() !== enabled) throw new Error('This browser could not save the connection setting.');
}

class RpcReadError extends Error {
  constructor(readonly code: number, readonly data?: string) { super('Private RPC rejected this read.'); }
}
async function readJson(response: Response, maxBytes = 5_000_000) {
  if (!response.ok || !response.body) throw new Error('RPC response unavailable.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.length; if (size > maxBytes) throw new Error('RPC response too large.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
let requestId = 0;
async function rpc(fetcher: typeof fetch, args: RpcArgs, signal: AbortSignal, maxBytes?: number) {
  const id = ++requestId;
  const response = await fetcher(PRIVATE_RPC_ENDPOINT, { method: 'POST', signal,
    headers: {'content-type':'application/json'}, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
    body: JSON.stringify({jsonrpc:'2.0',id,method:args.method,params:args.params ?? []}) });
  const data = await readJson(response, maxBytes);
  if (!data || data.jsonrpc !== '2.0' || data.id !== id || Array.isArray(data)) throw new Error('Invalid RPC response.');
  if (data.error) {
    if (!Number.isInteger(data.error.code)) throw new Error('Invalid RPC error.');
    throw new RpcReadError(data.error.code, typeof data.error.data === 'string' && /^0x[0-9a-f]*$/i.test(data.error.data) ? data.error.data : undefined);
  }
  if (!Object.prototype.hasOwnProperty.call(data, 'result')) throw new Error('RPC result missing.');
  return data.result;
}

/** The only direct bootstrap traffic: chain ID and the two public specifier getters. */
export function restrictedBootstrap(fetcher: typeof fetch = fetch): BootstrapProvider {
  return {request: async args => {
    const params = args.params as [{to?: string; data?: string; from?: string}, string] | undefined;
    const validCall = args.method === 'eth_call' && Array.isArray(params) && params.length === 2 &&
      params[1] === 'latest' && params[0]?.to?.toLowerCase() === NYM_SPECIFIER.toLowerCase() &&
      SPECIFIER_CALLS.has(params[0]?.data ?? '') && Object.keys(params[0]).every(key => key === 'to' || key === 'data');
    if (!(args.method === 'eth_chainId' && (!args.params || (Array.isArray(args.params) && args.params.length === 0))) && !validCall)
      throw new Error('Only public Anon-RPC specifier reads may use the bootstrap provider.');
    return rpc(fetcher,args,AbortSignal.timeout(20_000),65_536);
  }};
}

async function defaultWorker(): Promise<Worker> {
  const bootstrap = restrictedBootstrap();
  if (await bootstrap.request({method:'eth_chainId'}) !== '0x1') throw new Error('Bootstrap must use Ethereum mainnet.');
  const {AnonRpcWorker} = await import('@anon-rpc/browser-harness');
  const worker = new AnonRpcWorker({address:NYM_SPECIFIER,config:undefined,preExisting:{rpcProvider:bootstrap}});
  // Do not echo worker logs (which could contain requests) into the browser console.
  void (async () => { try { for (;;) await worker.acceptLog(); } catch { /* Worker closed. */ } })();
  return worker;
}

function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve,reject) => {
    const abort = () => reject(new Error(FAILURE));
    if (signal.aborted) { void promise.catch(() => {}); reject(new Error(FAILURE)); return; }
    signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(() => signal.removeEventListener('abort',abort));
  });
}

export function createPrivateReadSession({createWorker = defaultWorker, startupMs = 120_000, requestMs = 60_000} = {}) {
  let worker: Worker | undefined, startup: Promise<Worker> | undefined, epoch = 0;
  let controller = new AbortController();
  let status: PrivateReadStatus = {phase:'idle'};
  const listeners = new Set<() => void>();
  const update = (next: PrivateReadStatus) => { status = next; listeners.forEach(listener => listener()); };
  const fail = () => {
    epoch++; controller.abort(); worker?.close(); worker = undefined;
    update({phase:'error'});
  };
  async function start() {
    if (status.phase === 'error') throw new Error(FAILURE);
    if (!startup) {
      const expected = epoch, signal = AbortSignal.any([controller.signal,AbortSignal.timeout(startupMs)]);
      update({phase:'starting'});
      startup = bounded((async () => {
        const candidate = await createWorker();
        if (signal.aborted || expected !== epoch) { candidate.close(); throw new Error(FAILURE); }
        worker = candidate;
        await bounded(candidate.ready,signal);
        const chain = await rpc(candidate.fetch,{method:'eth_chainId'},signal);
        if (chain !== '0x1' || signal.aborted || expected !== epoch) throw new Error(FAILURE);
        update({phase:'ready'});
        return candidate;
      })(),signal).catch(() => { if (expected === epoch) fail(); throw new Error(FAILURE); });
    }
    return startup;
  }
  return {
    getSnapshot: () => status,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reset: () => {
      epoch++; controller.abort(); worker?.close(); worker = undefined; startup = undefined;
      controller = new AbortController(); update({phase:'idle'});
    },
    request: async ({method,params}: RpcArgs) => {
      if (!READ_METHODS.has(method)) throw new Error('Anon-RPC accepts supported reads only, never signatures or transactions.');
      const expected = epoch, instance = await start();
      if (expected !== epoch) throw new Error(FAILURE);
      try {
        const signal = AbortSignal.any([controller.signal,AbortSignal.timeout(requestMs)]);
        const result = await bounded(rpc(instance.fetch,{method,params},signal),signal);
        if (expected !== epoch) throw new Error(FAILURE);
        if (method === 'eth_chainId' && result !== '0x1') throw new Error(FAILURE);
        if (method === 'eth_blockNumber') {
          if (typeof result !== 'string' || !/^0x[0-9a-f]+$/i.test(result)) throw new Error(FAILURE);
          update({phase:'ready',block:BigInt(result).toString()});
        }
        return result;
      } catch (error) {
        // EVM reverts are read results, not permission to bypass the private transport.
        if (error instanceof RpcReadError) throw error;
        if (expected === epoch) fail();
        throw new Error(FAILURE);
      }
    },
  };
}

export const privateReadSession = createPrivateReadSession();
export const privateReadTransport = () => custom({request: privateReadSession.request},{retryCount:0});
if (typeof window !== 'undefined') window.addEventListener('pagehide',() => privateReadSession.reset());
