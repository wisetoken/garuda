import { renderStakeCollectible } from '../../src/lib/blend/stake-collectible-art';
import { parseStakeSnapshot, type StakeSnapshot } from '../../src/lib/blend/stake-snapshot';
import { stakeCollection } from '../../src/lib/blend/stake-collections';
import type { SaleRow } from '../../src/lib/blend/sales';
export const ARTWORK_RENDERER = 'wiseone-yoda-live-v2';
export function prepareArtwork(row: SaleRow, input: StakeSnapshot) {
  const s = parseStakeSnapshot(input, row.order);
  const svg = renderStakeCollectible({ collection:s.collection, tokenId:s.tokenId, stakeId:s.stakeId,
    principal:BigInt(s.principal), startAt:s.startAt, maturesAt:s.maturesAt });
  return { svg, metadata: {
    name: `WISE ${stakeCollection(s.collection).name} #${s.tokenId}`,
    description: 'Garuda artwork backup generated from verified Ethereum stake data. This snapshot is not live ownership, yield or trading authority. The original NFT tokenURI is unchanged.',
    properties: { chain_id:1, collection:s.collection, token_id:s.tokenId, stake_id:s.stakeId,
      principal_wei:s.principal, start_timestamp:s.startAt, maturity_timestamp:s.maturesAt,
      observed_block:s.blockNumber, observed_block_hash:s.blockHash, observed_at:s.observedAt,
      order_hash:row.hash, renderer_version:ARTWORK_RENDERER },
  } };
}
export type PreparedArtwork = ReturnType<typeof prepareArtwork>;
