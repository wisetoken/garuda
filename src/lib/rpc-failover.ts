import { http } from "viem";
import { privateReadsEnabled, privateReadTransport } from './private-rpc';

// Independent of Thirdweb's quota. Never fall back to a different chain.
const PUBLIC_RPCS: Record<number, readonly string[]> = {
    1: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
    42161: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"],
    8453: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
};
const THIRDWEB_CHAINS: Record<string, number> = {
    "1": 1, ethereum: 1, "42161": 42161, arbitrum: 42161, "8453": 8453, base: 8453,
};
const READ_METHODS = new Set([
    "eth_chainId", "net_version", "eth_blockNumber", "eth_call", "eth_estimateGas",
    "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getBalance",
    "eth_getCode", "eth_getStorageAt", "eth_getLogs", "eth_getBlockByNumber",
    "eth_getBlockByHash", "eth_getTransactionByHash", "eth_getTransactionReceipt",
    "eth_getTransactionCount", "eth_getBlockTransactionCountByHash", "eth_getBlockTransactionCountByNumber",
]);
const nativeFetch = globalThis.fetch.bind(globalThis);
const cooldowns = new Map<string, number>();
const ATTEMPT_TIMEOUT_MS = 6_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;

function thirdwebEndpoint(url: URL) {
    const match = /^([a-z0-9]+)\.rpc\.thirdweb\.com$/.exec(url.hostname);
    const chainId = match && Object.prototype.hasOwnProperty.call(THIRDWEB_CHAINS, match[1])
        ? THIRDWEB_CHAINS[match[1]] : undefined;
    return url.protocol === "https:" && !url.port && chainId
        ? { chainId, clientId: url.pathname.slice(1) }
        : null;
}

function providerKey(endpoint: string) {
    const thirdweb = thirdwebEndpoint(new URL(endpoint));
    // This quota is shared across the named/numeric URLs and supported networks.
    return thirdweb ? `thirdweb:${thirdweb.clientId}` : endpoint;
}

export function getReadRpcUrls(chainId: number, primaryUrl?: string): string[] {
    const publicUrls = PUBLIC_RPCS[chainId];
    if (!publicUrls) throw new Error(`No read RPC configuration for chain ${chainId}.`);
    const configured = chainId === 1 ? import.meta.env.VITE_MAINNET_RPC_URL
        : chainId === 42161 ? undefined : undefined;
    const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID;
    const primary = primaryUrl?.trim() || configured?.trim()
        || (clientId ? `https://${chainId}.rpc.thirdweb.com/${clientId}` : publicUrls[0]);
    return [...new Set([primary, ...publicUrls])];
}

function isReadBody(body: string): boolean {
    try {
        const parsed = JSON.parse(body);
        const requests = Array.isArray(parsed) ? parsed : [parsed];
        // Mixed batches containing a send/sign/wallet method must never be replayed.
        return requests.length > 0 && requests.every((request) => READ_METHODS.has(request?.method));
    } catch {
        return false;
    }
}

function isRateLimited(body: string): boolean {
    try {
        const parsed = JSON.parse(body);
        return (Array.isArray(parsed) ? parsed : [parsed]).some(({ error }) => error && (
            error.code === 429 || error.code === -32005
            || /rate.?limit|too many requests|quota.*exceed/i.test(error.message ?? "")
        ));
    } catch {
        return false;
    }
}

function cooldownMs(response: Response, rateLimited: boolean) {
    const minimum = rateLimited ? RATE_LIMIT_COOLDOWN_MS : 15_000;
    const retryAfter = response.headers.get("retry-after");
    if (!retryAfter) return minimum;
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
    return Number.isFinite(delay) ? Math.max(minimum, Math.min(delay, 300_000)) : minimum;
}

/** Failover is restricted to idempotent JSON-RPC reads; no transaction rebroadcasts. */
export function createRpcFailoverFetch(
    chainId: number,
    primaryUrl: string,
    fetcher: typeof fetch = nativeFetch,
    attemptTimeoutMs = ATTEMPT_TIMEOUT_MS,
): typeof fetch {
    const endpoints = getReadRpcUrls(chainId, primaryUrl);
    return async (input, init) => {
        // Inspect a clone so passthrough Request objects retain an unused body.
        const request = new Request(input instanceof Request ? input.clone() : input, init);
        if (request.method !== "POST") return fetcher(input, init);
        const body = await request.clone().text();
        if (!isReadBody(body)) return fetcher(input, init);

        let lastResponse: Response | undefined;
        let lastError: unknown;
        for (const endpoint of endpoints) {
            if (request.signal.aborted) throw request.signal.reason;
            const key = providerKey(endpoint);
            if ((cooldowns.get(key) ?? 0) > Date.now()) continue;
            const controller = new AbortController();
            const abort = () => controller.abort(request.signal.reason);
            request.signal.addEventListener("abort", abort, { once: true });
            const timer = setTimeout(() => controller.abort(new Error("RPC request timed out.")), attemptTimeoutMs);
            try {
                const response = await fetcher(endpoint, {
                    method: "POST", body,
                    // Never forward provider credentials, cookies or SDK headers to backups.
                    headers: new URL(endpoint).href === request.url ? request.headers : { "Content-Type": "application/json" },
                    credentials: new URL(endpoint).href === request.url ? request.credentials : "omit",
                    signal: controller.signal,
                });
                // Include body reads in the timeout and preserve JSON-RPC IDs/batch ordering.
                const text = await response.text();
                lastResponse = new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
                const limited = response.status === 429 || isRateLimited(text);
                if (!limited && response.status !== 408 && response.status < 500) return lastResponse;
                cooldowns.set(key, Date.now() + cooldownMs(response, limited));
            } catch (error) {
                if (request.signal.aborted) throw request.signal.reason;
                lastError = error;
                cooldowns.set(key, Date.now() + 15_000);
            } finally {
                clearTimeout(timer);
                request.signal.removeEventListener("abort", abort);
            }
        }
        if (lastResponse) return lastResponse;
        throw lastError ?? new Error("Network data is temporarily unavailable. Please try again shortly.");
    };
}

export function readRpcTransport(chainId: number, primaryUrl?: string) {
    // Privacy failures never enter the ordinary direct-provider fallback loop.
    if (chainId === 1 && privateReadsEnabled()) return privateReadTransport();
    const [primary] = getReadRpcUrls(chainId, primaryUrl);
    return http(primary, {
        fetchFn: createRpcFailoverFetch(chainId, primary),
        batch: { wait: 10, batchSize: 40 },
        retryCount: 0,
        timeout: 20_000,
    });
}

const thirdwebClientIds = new Set<string>();
let thirdwebInstalled = false;
const thirdwebFetchers = new Map<string, typeof fetch>();

/**
 * This SDK version has no custom fetch/transport hook. Scope its fetch adapter to
 * our exact Thirdweb RPC URLs and read methods; auth, storage, wallets and writes
 * pass straight through. Viem uses the same failover policy without this adapter.
 */
export function installThirdwebRpcFailover(clientId: string) {
    if (typeof window === "undefined" || !clientId) return;
    thirdwebClientIds.add(clientId);
    if (thirdwebInstalled) return;
    thirdwebInstalled = true;
    globalThis.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
        const endpoint = thirdwebEndpoint(url);
        if (!endpoint || !thirdwebClientIds.has(endpoint.clientId) || url.search) return nativeFetch(input, init);
        let fetcher = thirdwebFetchers.get(url.href);
        if (!fetcher) {
            fetcher = createRpcFailoverFetch(endpoint.chainId, url.href);
            thirdwebFetchers.set(url.href, fetcher);
        }
        return fetcher(input, init);
    };
}
