import type { Address, Hex, PublicClient } from "viem";
import { querySubgraph } from "@/lib/wise-staking/subgraph";
import { queryStakeStartTxHash } from "@/lib/wise-stake-start-tx";

const CREATION_QUERY = `
  query GarudaStakeCreation($ids: [ID!]!) {
    stakes(where: { id_in: $ids }, first: 1) {
      id
      createdAtTransactionHash
      createdAtBlock
    }
  }
`;
type CreationRecord = {
  id: string;
  createdAtTransactionHash?: string | null;
  createdAtBlock?: string | null;
};

export function validCreationHash(value?: string | null): Hex | null {
  return value && /^0x[a-fA-F0-9]{64}$/.test(value) && !/^0x0{64}$/.test(value) ? value as Hex : null;
}

/** Same indexer and StakeStart lookup as WiseOne; NFT stakes belong to the wrapper contract. */
export async function loadStakeCreationTx(client: PublicClient, stakeId: string, collection: Address): Promise<Hex | null> {
  if (!/^0x[a-fA-F0-9]{32}$/.test(stakeId)) return null;
  const id = stakeId.toLowerCase();
  const data = await querySubgraph<{ stakes: CreationRecord[] }>(CREATION_QUERY, { ids: [id] });
  const record = data.stakes.find(stake => stake.id.toLowerCase() === id);
  if (!record) return null;
  const indexedHash = validCreationHash(record.createdAtTransactionHash);
  if (indexedHash) return indexedHash;
  const block = Number(record.createdAtBlock);
  if (!Number.isSafeInteger(block) || block <= 0) return null;
  // Use the collection, never the current NFT owner's wallet (ownership can change).
  return validCreationHash(await queryStakeStartTxHash(client, id, collection, block));
}
