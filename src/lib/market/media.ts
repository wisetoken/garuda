export type MediaReceipt = {
  version: 1;
  chainId: 1;
  collection: string;
  tokenId: string;
  orderHash: string;
  observedBlock: string;
  observedBlockHash: string;
  observedAt: number;
  renderer: string;
  image: { reference: string; sha256: string };
  metadata: { reference: string; sha256: string };
  verifiedAt: number;
  arkivEntity?: string;
};
export type MediaBackupStatus = {
  state: 'disabled' | 'queued' | 'retrying' | 'uploading' | 'unavailable' | 'ready';
  receipt?: MediaReceipt;
  gateway?: string;
};
export function swarmFileUrl(gateway: string, reference: string) {
  if (!/^[a-f0-9]{64}$/.test(reference)) throw new Error('Invalid Swarm reference.');
  const url = new URL(gateway);
  if (url.username || url.password || url.search || url.hash ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))))
    throw new Error('Invalid Swarm gateway.');
  return `${url.href.replace(/\/$/, '')}/bzz/${reference}/`;
}

/** Verify bytes before displaying an SVG as an isolated image, never inline markup. */
export async function fetchSwarmImage(gateway: string, file: MediaReceipt['image'], signal: AbortSignal, request = fetch) {
  if (!/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid artwork checksum.');
  const response = await request(swarmFileUrl(gateway,file.reference), {
    signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',
  });
  if (!response.ok || !response.body) throw new Error('Artwork unavailable through this gateway.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done,value}=await reader.read(); if (done) break;
      size+=value.length; if(size>1_000_000) throw new Error('Artwork exceeds the size limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  const bytes=new Uint8Array(size); let offset=0;
  for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==file.sha256) throw new Error('Artwork checksum did not match the saved reference.');
  return new Blob([bytes],{type:'image/svg+xml'});
}
