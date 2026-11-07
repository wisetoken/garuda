import { SalesError } from '../../src/lib/blend/sales';

/** Keep credentials, request bodies, signatures and provider URLs out of logs. */
export function marketFailureDetails(error: unknown) {
  const causes: { name: string; code?: string | number; status?: number }[] = [];
  const seen = new Set<object>();
  for (let current = error; current && typeof current === 'object' && causes.length < 5;) {
    if (seen.has(current)) break;
    seen.add(current);
    const item = current as { name?: unknown; code?: unknown; status?: unknown; cause?: unknown };
    causes.push({
      name: typeof item.name === 'string' && /^[A-Za-z]{1,64}Error$|^Error$/.test(item.name) ? item.name : 'Error',
      ...(current instanceof SalesError ? { code: current.code } :
        typeof item.code === 'number' && Number.isSafeInteger(item.code) ? { code: item.code } :
        typeof item.code === 'string' && /^(?:[0-9A-Z]{5}|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE)$/.test(item.code) ? { code: item.code } : {}),
      ...(typeof item.status === 'number' && item.status >= 400 && item.status <= 599 ? { status: item.status } : {}),
    });
    current = item.cause;
  }
  return { causes };
}

export function reportMarketFailure(operation: string, collection: string, error: unknown) {
  console.error('[garuda:market]', { operation, collection, ...marketFailureDetails(error) });
}
