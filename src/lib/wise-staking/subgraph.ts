type SubgraphResponse<T> = {
    data?: T;
    errors?: Array<{ message: string }>;
    error?: string;
};

export type QuerySubgraphOptions = {
    /** Skip the server subgraph proxy cache (use after create/close/scrape). */
    bypassCache?: boolean;
};

const MAX_CLIENT_CONCURRENT = 3;
const CLIENT_CIRCUIT_MS = 12_000;

const inflight = new Map<string, Promise<unknown>>();
let active = 0;
const waiters: Array<() => void> = [];
let clientCircuitUntil = 0;

function isClientCircuitOpen() {
    return Date.now() < clientCircuitUntil;
}

function tripClientCircuit() {
    clientCircuitUntil = Date.now() + CLIENT_CIRCUIT_MS;
}

function acquireSlot(): Promise<void> {
    if (active < MAX_CLIENT_CONCURRENT) {
        active += 1;
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
        waiters.push(() => {
            active += 1;
            resolve();
        });
    });
}

function releaseSlot() {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) next();
}

function requestKey(query: string, variables?: Record<string, unknown>, bypassCache?: boolean) {
    return JSON.stringify({ query, variables, bypassCache: Boolean(bypassCache) });
}

function isRateLimitMessage(message: string) {
    return /too many requests|rate limit/i.test(message);
}

async function querySubgraphOnce<T>(
    query: string,
    variables: Record<string, unknown> | undefined,
    bypassCache: boolean,
): Promise<T> {
    // Bypass still hits Graph — skip it while throttled. Normal reads go to
    // /api/subgraph so a stale server cache can be served.
    if (bypassCache && isClientCircuitOpen()) {
        throw new Error("Too many requests");
    }

    const response = await fetch("/api/subgraph", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(bypassCache ? { "X-WiseOne-Bypass-Cache": "1" } : {}),
        },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as SubgraphResponse<T> | null;
    const message =
        payload?.errors?.[0]?.message
        || payload?.error
        || (response.status === 429 || response.status === 503
            ? "Too many requests"
            : "Subgraph query failed.");

    if (isRateLimitMessage(message) || response.status === 429 || response.status === 503) {
        tripClientCircuit();
    }

    if (payload?.data && (response.ok || !payload.errors?.length)) {
        return payload.data;
    }

    throw new Error(message);
}

export async function querySubgraph<T>(
    query: string,
    variables?: Record<string, unknown>,
    options?: QuerySubgraphOptions,
): Promise<T> {
    const bypassCache = options?.bypassCache === true;
    const key = requestKey(query, variables, bypassCache);
    const existing = inflight.get(key);
    if (existing) {
        return existing as Promise<T>;
    }

    const run = (async () => {
        await acquireSlot();
        try {
            return await querySubgraphOnce<T>(query, variables, bypassCache);
        } finally {
            releaseSlot();
        }
    })().finally(() => {
        inflight.delete(key);
    });

    inflight.set(key, run);
    return run;
}

export function isSubgraphRateLimited() {
    return isClientCircuitOpen();
}
