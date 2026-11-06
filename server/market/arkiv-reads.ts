import { http } from 'viem';
import { SalesError } from '../../src/lib/blend/sales';

// Read retries are independent of transaction submission. Never retry writes here.
export const arkivReadOptions = { timeout: 6_000, retryCount: 1, retryDelay: 500 } as const;

/** Bounded read-only retries. Long Retry-After values must not hold an API request open. */
export function arkivReadTransport(url?: string, options: {
  timeout?: number; retryDelay?: number; fetchFn?: typeof fetch;
} = {}) {
  const timeout = options.timeout ?? arkivReadOptions.timeout;
  const retryDelay = options.retryDelay ?? arkivReadOptions.retryDelay;
  const request = options.fetchFn ?? fetch;
  const cooldowns = new Map<string, { until: number; status: number }>();
  return http(url, {
    // Viem otherwise sleeps for Retry-After (potentially minutes) outside its HTTP timeout.
    retryCount: 0,
    timeout: timeout * 2 + retryDelay + 100,
    fetchFn: async (input, init) => {
      const method = typeof init?.body === 'string' ? JSON.parse(init.body).method : 'unknown';
      const cooldown = cooldowns.get(method);
      if (cooldown && cooldown.until > Date.now())
        return new Response('Arkiv RPC is busy. Please retry shortly.', { status: cooldown.status });
      cooldowns.delete(method);
      for (let attempt = 0; ; attempt++) {
        const signal = AbortSignal.any([
          AbortSignal.timeout(timeout), ...(init?.signal ? [init.signal] : []),
        ]);
        try {
          const response = await request(input, { ...init, signal });
          // Include body download in the deadline, not just the arrival of HTTP headers.
          const body = await response.arrayBuffer();
          const result = new Response(body, {
            status: response.status, statusText: response.statusText, headers: response.headers,
          });
          const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
          if (!retryable) return result;
          const delay = readRetryAfter(response.headers.get('Retry-After')) ?? retryDelay;
          if (delay > retryDelay || attempt >= arkivReadOptions.retryCount) {
            if (response.status === 429 || response.status === 503)
              cooldowns.set(method, { until: Date.now() + delay, status: response.status });
            return result;
          }
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
          if (init?.signal?.aborted || attempt >= arkivReadOptions.retryCount) throw error;
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    },
  });
}

function readRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/** Share simultaneous requests only; every subsequent refresh reads Arkiv again. */
export function inFlightOnly<T>() {
  const pending = new Map<string, Promise<T>>();
  return (key: string, read: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const result = Promise.resolve().then(read).finally(() => pending.delete(key));
    pending.set(key, result);
    return result;
  };
}

export function arkivDiscoveryFailure(error: unknown): SalesError {
  if (error instanceof SalesError) return error;
  let current = error;
  let throttled = false;
  const codes: (string | number)[] = [];
  for (let depth = 0; current && typeof current === 'object' && depth < 6; depth++) {
    const item = current as { code?: unknown; status?: unknown; cause?: unknown };
    for (const code of [item.code, item.status]) {
      if (typeof code === 'number') codes.push(code);
      if (code === 429 || code === -32005) throttled = true;
    }
    current = item.cause;
  }
  // Do not log RPC URLs, access keys, signatures, or raw provider error messages.
  console.error('Garuda Arkiv discovery failed', { codes, throttled });
  return new SalesError(throttled ? 'rate-limit' : 'arkiv-unavailable', throttled
    ? 'Arkiv is busy. Please wait a moment and retry.'
    : 'Arkiv orders could not be loaded. Please retry.');
}
