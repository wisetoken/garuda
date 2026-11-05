/** Shared NFT discovery for the dashboard and yoda. The caller supplies its RPC transport. */
export type NftStakeRef = {
    nftId: string;
    isScrapable: boolean;
    contractAddress: string;
    stakeId?: string;
};
export async function discoverNftStakes(
    collections: readonly { address: string; supportsScraping: boolean }[],
    readIds: (address: string) => Promise<readonly bigint[]>,
    readStakeId: (address: string, tokenId: bigint) => Promise<string | null>,
): Promise<NftStakeRef[]> {
    const groups = await Promise.all(collections.map(async collection => {
        const ids = await readIds(collection.address);
        if (new Set(ids.map(String)).size !== ids.length) throw new Error("Duplicate NFT IDs in inventory.");
        const refs: NftStakeRef[] = [];
        for (let offset = 0; offset < ids.length; offset += 8) {
            const batch = await Promise.all(ids.slice(offset, offset + 8).map(async tokenId => {
                const stakeId = await readStakeId(collection.address, tokenId);
                if (!stakeId || /^0x0+$/.test(stakeId)) throw new Error("Stake identity could not be resolved. Refresh to retry.");
                return { nftId: String(tokenId), contractAddress: collection.address,
                    isScrapable: collection.supportsScraping, stakeId };
            }));
            refs.push(...batch);
        }
        return refs;
    }));
    return groups.flat();
}
