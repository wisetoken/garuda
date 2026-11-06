import { SalesError } from '../../src/lib/blend/sales';

// Read retries are independent of transaction submission. Never retry writes here.
export const arkivReadOptions = { timeout: 6_000, retryCount: 1, retryDelay: 500 } as const;

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
    ? 'Arkiv is busy. Please wait a moment and retry, or load the order catalog.'
    : 'Arkiv orders could not be loaded. Please retry or load the order catalog.');
}
