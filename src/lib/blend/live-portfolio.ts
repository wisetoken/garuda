import type { SubgraphStake } from "@/components/staking/staking-types";
import {
    getAddress,
    isAddress,
    parseAbi,
    type Address,
    type Hex,
    type PublicClient,
} from "viem";
import { discoverNftStakes } from "../wise-staking/nft-discovery";
import { STAKE_COLLECTIONS, stakeCollection } from "./stake-collections";
import { COLLECTIONS, DAY } from "./domain";

export const SIGNATURE_COLLECTION = getAddress(COLLECTIONS[0].address);
export const SIGNATURE_WISE = getAddress(
    "0x66a0f676479cee1d7373f3dc2e2952778bff5bd6",
);
const LAUNCH_TIME = 1_604_966_400;
const MAX_NFTS = 250;
const NFT_ABI = parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function walletOfOwner(address) view returns (uint256[])",
    "function NFTStake(uint256) view returns (bytes16)",
    "function ownerOf(uint256) view returns (address)",
    "function wiseToken() view returns (address)",
]);
const STAKE_ABI = parseAbi([
    "function stakes(address,bytes16) view returns(uint256,uint256,uint256,uint64,uint64,uint64,uint64,uint256,uint256,uint256,address,bool)",
    "function checkStakeByID(address,bytes16) view returns(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool,bool)",
]);
export type SignaturePosition = {
    displayStake?: SubgraphStake;
    collection?: Address;
    tokenId: string;
    stakeId: Hex;
    owner: Address;
    principal: bigint;
    shares: bigint;
    startAt: number;
    maturesAt: number;
    status: "Pending" | "Active" | "Mature" | "Closed";
    canList: boolean;
    observedAt?: number;
    unclaimedInterest?: bigint;
    rewardDays?: number;
};
export type SignaturePortfolio = {
    owner: Address;
    positions: SignaturePosition[];
    blockNumber: bigint;
    blockHash: Hex;
    timestamp: number;
};
type Reader = Pick<PublicClient, "getChainId" | "getBlock" | "readContract">;

/** Read-only, block-consistent inventory. No fixtures, cached fallback or signing. */
export async function loadSignaturePortfolio(
    client: Reader,
    rawOwner: string,
    expectedChainId: 1 | 31337 = 1,
    collection: Address = SIGNATURE_COLLECTION,
    requestedTokenIds?: readonly string[],
): Promise<SignaturePortfolio> {
    const collectionInfo = stakeCollection(collection);
    if (!isAddress(rawOwner, { strict: false }))
        throw new Error("Enter a valid Ethereum address.");
    const owner = getAddress(rawOwner.toLowerCase());
    const [chainId, block] = await Promise.all([
        client.getChainId(),
        client.getBlock(),
    ]);
    if (chainId !== expectedChainId || block.number === null || !block.hash)
        throw new Error("The expected Ethereum network is required.");
    const blockNumber = block.number;
    const requestedIds = requestedTokenIds?.map(id => {
        if (!/^[0-9]+$/.test(id)) throw new Error("Invalid NFT token ID.");
        return BigInt(id);
    });
    if (requestedIds && (requestedIds.length > MAX_NFTS || new Set(requestedIds.map(String)).size !== requestedIds.length))
        throw new Error("Invalid requested NFT inventory.");
    const [count, wise] = await Promise.all([
        requestedIds ? Promise.resolve(BigInt(requestedIds.length)) : client.readContract({
            address: collection,
            abi: NFT_ABI,
            functionName: "balanceOf",
            args: [owner],
            blockNumber,
        }),
        client.readContract({
            address: collection,
            abi: NFT_ABI,
            functionName: "wiseToken",
            blockNumber,
        }),
    ]);
    if (wise.toLowerCase() !== SIGNATURE_WISE.toLowerCase())
        throw new Error(
            `The ${collectionInfo.name} collection has an unexpected WISE binding.`,
        );
    if (count > BigInt(MAX_NFTS))
        throw new Error(
            "This wallet exceeds the current 250-NFT portfolio limit. Use Staking Dashboard to view it.",
        );
    const ids = requestedIds ?? (
        count === 0n
            ? []
            : await client.readContract({
                  address: collection,
                  abi: NFT_ABI,
                  functionName: "walletOfOwner",
                  args: [owner],
                  blockNumber,
              }));
    if (
        BigInt(ids.length) !== count ||
        new Set(ids.map(String)).size !== ids.length
    )
        throw new Error(
            "The collection returned an incomplete inventory. Refresh to retry.",
        );
    const refs = await discoverNftStakes([collectionInfo], async () => ids,
        async (_, tokenId) => client.readContract({ address: collection, abi: NFT_ABI,
            functionName: "NFTStake", args: [tokenId], blockNumber }));
    const positions: SignaturePosition[] = [];
    for (let i = 0; i < refs.length; i += 8) {
        positions.push(
            ...(await Promise.all(
                refs.slice(i, i + 8).map(async (ref) => {
                    const tokenId = BigInt(ref.nftId);
                    const stakeId = ref.stakeId as Hex;
                    // Independent reads share one multicall batch instead of
                    // waiting for owner, stake and yield in three RPC rounds.
                    const [actualOwner, stake, check] = await Promise.all([
                        client.readContract({ address: collection, abi: NFT_ABI,
                            functionName: "ownerOf", args: [tokenId], blockNumber }),
                        client.readContract({ address: SIGNATURE_WISE, abi: STAKE_ABI,
                            functionName: "stakes", args: [collection, stakeId], blockNumber }),
                        client.readContract({ address: SIGNATURE_WISE, abi: STAKE_ABI,
                            functionName: "checkStakeByID", args: [collection, stakeId], blockNumber })
                            .catch(() => undefined),
                    ]);
                    if (actualOwner.toLowerCase() !== owner.toLowerCase() || /^0x0{32}$/.test(stakeId))
                        throw new Error("Stake ownership or identity could not be verified. Refresh to retry.");
                    const startAt = LAUNCH_TIME + Number(stake[3]) * DAY;
                    const maturesAt = LAUNCH_TIME + Number(stake[5]) * DAY;
                    if (
                        !Number.isSafeInteger(startAt) ||
                        !Number.isSafeInteger(maturesAt)
                    )
                        throw new Error("Invalid stake dates.");
                    const active = stake[11] && stake[6] === 0n;
                    const canList =
                        active &&
                        stake[0] > 0n &&
                        stake[1] > 0n &&
                        stake[5] === stake[3] + stake[4];
                    const status: SignaturePosition["status"] = !active
                        ? "Closed"
                        : Number(block.timestamp) < startAt
                          ? "Pending"
                          : Number(block.timestamp) >= maturesAt
                            ? "Mature"
                            : "Active";
                    let unclaimedInterest: bigint | undefined;
                    let rewardDays: number | undefined;
                    // Yield is supplementary: an unavailable reward read must not
                    // hide the owner's NFT or pretend missing rewards are zero.
                    if (check && active) {
                        unclaimedInterest = check[7];
                        const currentDay = Math.floor((Number(block.timestamp) - LAUNCH_TIME) / DAY);
                        rewardDays = Math.max(0, Math.min(currentDay, Number(check[2])) - Math.max(Number(check[0]), Number(check[4])));
                    }
                    const displayStake: SubgraphStake = {
                        id: stakeId, stakedAmount: String(stake[1]), stakesShares: String(stake[0]),
                        startDay: String(stake[3]), lockDays: String(stake[4]), closeDay: String(stake[6]),
                        rewardAmount: String(unclaimedInterest ?? 0n), penaltyAmount: "0", scrapedAmount: "0",
                        isActive: active, referrer: null, createdAtTimestamp: String(startAt), closedAtTimestamp: "0",
                    };
                    return {
                        displayStake,
                        collection,
                        tokenId: String(tokenId),
                        stakeId,
                        owner,
                        principal: stake[1],
                        shares: stake[0],
                        startAt,
                        maturesAt,
                        status,
                        canList,
                        observedAt: Number(block.timestamp),
                        unclaimedInterest,
                        rewardDays,
                    };
                }),
            )),
        );
    }
    const confirmed = await client.getBlock({ blockNumber });
    if (confirmed.hash !== block.hash)
        throw new Error("The chain changed during loading. Refresh to retry.");
    return {
        owner,
        positions,
        blockNumber,
        blockHash: block.hash,
        timestamp: Number(block.timestamp),
    };
}

/** Combined NFT inventory using the same discovery path as the WiseOne dashboard. */
export async function loadWalletStakePortfolio(client: Reader, owner: string) {
    const portfolios = await Promise.all(Object.values(STAKE_COLLECTIONS).map(collection =>
        loadSignaturePortfolio(client, owner, 1, collection.address)));
    return { positions: portfolios.flatMap(portfolio => portfolio.positions),
        timestamp: Math.min(...portfolios.map(portfolio => portfolio.timestamp)) };
}
