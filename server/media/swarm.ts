import { createHash } from 'node:crypto';
import { swarmFileUrl } from '../../src/lib/market/media';
export const MAX_MEDIA_BYTES = 1_000_000;
export const PUBLIC_SWARM_GATEWAY = 'https://api.gateway.ethswarm.org';
export type SwarmConfig = { mode: 'bee' | 'public-gateway'; bee: string; gateway: string; batch: string; token?: string };
export function swarmConfig(env: Record<string,string|undefined> = process.env): SwarmConfig | null {
  if (env.SWARM_MEDIA_ENABLED !== 'true') return null;
  const mode = env.SWARM_UPLOAD_MODE || 'bee';
  if (mode !== 'bee' && mode !== 'public-gateway') throw new Error('Unknown Swarm upload mode.');
  // The official public gateway supplies postage for small uploads. Never send Bee credentials to it.
  if (mode === 'public-gateway' && (env.SWARM_BEE_URL || env.SWARM_POSTAGE_BATCH_ID || env.SWARM_BEE_API_TOKEN))
    throw new Error('Remove Bee credentials and postage settings when using the public Swarm gateway.');
  const bee = mode === 'public-gateway' ? PUBLIC_SWARM_GATEWAY : env.SWARM_BEE_URL ?? '';
  const gateway = env.SWARM_GATEWAY_URL || PUBLIC_SWARM_GATEWAY;
  const batch = mode === 'public-gateway' ? '0'.repeat(64) : env.SWARM_POSTAGE_BATCH_ID ?? '';
  // These are operator settings, never user-supplied upload destinations.
  swarmFileUrl(bee, '0'.repeat(64)); swarmFileUrl(gateway, '0'.repeat(64));
  if (!/^[a-f0-9]{64}$/i.test(batch)) throw new Error('Configure a usable Swarm postage batch.');
  return { mode, bee: bee.replace(/\/$/, ''), gateway: gateway.replace(/\/$/, ''), batch, token: env.SWARM_BEE_API_TOKEN };
}
export const sha256 = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');
export async function boundedBody(response: Response, max = MAX_MEDIA_BYTES): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new Error(`Swarm request failed (HTTP ${response.status}).`);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > max) throw new Error('Swarm response exceeds limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function uploadFile(config: SwarmConfig, body: Uint8Array, contentType: string, name: string, request = fetch) {
  if (!body.length || body.length > MAX_MEDIA_BYTES) throw new Error('Invalid artwork size.');
  const response = await request(`${config.bee}/bzz?name=${encodeURIComponent(name)}`, {
    method: 'POST', body: Buffer.from(body), redirect: 'error', signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': contentType, 'swarm-postage-batch-id': config.batch, 'swarm-deferred-upload': 'false',
      ...(config.mode === 'bee' ? { 'swarm-pin': 'true', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) } : {}) },
  });
  const data = JSON.parse(new TextDecoder().decode(await boundedBody(response, 4096)));
  if (typeof data.reference !== 'string' || !/^[a-f0-9]{64}$/.test(data.reference)) throw new Error('Invalid Swarm upload receipt.');
  return { reference: data.reference as string, sha256: sha256(body) };
}
export async function verifyFile(config: SwarmConfig, file: {reference: string; sha256: string}, request = fetch) {
  const response = await request(swarmFileUrl(config.gateway, file.reference), {
    redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30_000),
  });
  if (sha256(await boundedBody(response)) !== file.sha256) throw new Error('Swarm retrieval differs from the uploaded artwork.');
}
