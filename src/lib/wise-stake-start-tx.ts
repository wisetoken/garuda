import { readRpcTransport } from "@/lib/rpc-failover";
import { privateReadsEnabled } from './private-rpc';
import { createPublicClient, parseAbiItem, type PublicClient } from "viem";
import { mainnet } from "viem/chains";

const WISE_TOKEN_ADDRESS: `0x${string}` = "0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6";
const STAKE_START_EVENT = parseAbiItem(
    "event StakeStart(bytes16 indexed stakeID, address indexed staker, address indexed referrer, uint256 stakedAmount, uint256 lockDays, uint256 startDay, uint256 closeDay, uint256 rewardAmount, uint256 referrerShares)",
);
const STAKE_END_EVENT = parseAbiItem(
    "event StakeEnd(bytes16 indexed stakeID, address indexed staker, uint256 stakedAmount, uint256 rewardAmount, uint256 penaltyAmount, uint256 closeDay)",
);

export type StakeLifecycleTxHashes = {
    startTx: `0x${string}` | null;
    endTx: `0x${string}` | null;
};

export function normalizeStakeId(id?: string | null) {
    if (!id) return "";
    return id.toLowerCase().replace(/^0x/, "");
}

export function toStakeIdBytes(id?: string | null): `0x${string}` | null {
    if (!id) return null;
    const hex = id.toLowerCase().replace(/^0x/, "").replace(/[^0-9a-f]/g, "");
    if (!hex) return null;
    const normalized = hex.length >= 32 ? hex.slice(0, 32) : hex.padEnd(32, "0");
    return `0x${normalized}` as `0x${string}`;
}

export async function queryStakeStartTxHash(
    client: PublicClient,
    stakeId: string,
    stakerAddress: string,
    blockNumber: number,
): Promise<`0x${string}` | null> {
    const normalizedStakeId = toStakeIdBytes(stakeId);
    if (!normalizedStakeId || !stakerAddress || !blockNumber) return null;

    try {
        const logs = await client.getLogs({
            address: WISE_TOKEN_ADDRESS,
            event: STAKE_START_EVENT,
            args: {
                stakeID: normalizedStakeId,
                staker: stakerAddress as `0x${string}`,
            },
            fromBlock: BigInt(blockNumber),
            toBlock: BigInt(blockNumber),
        });
        return logs[0]?.transactionHash ?? null;
    } catch (error) {
        console.error("[stakeStartTx] lookup failed:", normalizedStakeId, error);
        return null;
    }
}

export async function queryStakeEndTxHash(
    client: PublicClient,
    stakeId: string,
    stakerAddress: string,
    blockNumber: number,
): Promise<`0x${string}` | null> {
    const normalizedStakeId = toStakeIdBytes(stakeId);
    if (!normalizedStakeId || !stakerAddress || !blockNumber) return null;

    try {
        const logs = await client.getLogs({
            address: WISE_TOKEN_ADDRESS,
            event: STAKE_END_EVENT,
            args: {
                stakeID: normalizedStakeId,
                staker: stakerAddress as `0x${string}`,
            },
            fromBlock: BigInt(blockNumber),
            toBlock: BigInt(blockNumber),
        });
        return logs[0]?.transactionHash ?? null;
    } catch (error) {
        console.error("[stakeEndTx] lookup failed:", normalizedStakeId, error);
        return null;
    }
}

const TX_FETCH_BATCH_SIZE = 12;

export async function fetchStakeLifecycleTxHashMap(
    client: PublicClient,
    stakerAddress: string,
    stakes: Array<{
        id: string;
        createdAtBlock?: string | null;
        closedAtBlock?: string | null;
        createdAtTransactionHash?: string | null;
        closedAtTransactionHash?: string | null;
    }>,
): Promise<Record<string, StakeLifecycleTxHashes>> {
    const map: Record<string, StakeLifecycleTxHashes> = {};

    for (let index = 0; index < stakes.length; index += TX_FETCH_BATCH_SIZE) {
        const batch = stakes.slice(index, index + TX_FETCH_BATCH_SIZE);
        await Promise.all(
            batch.map(async (stake) => {
                const stakeKey = normalizeStakeId(stake.id);
                if (!stakeKey) return;

                const entry: StakeLifecycleTxHashes = {
                    startTx: (stake.createdAtTransactionHash as `0x${string}` | null) ?? null,
                    endTx: (stake.closedAtTransactionHash as `0x${string}` | null) ?? null,
                };

                const createdAtBlock = Number(stake.createdAtBlock) || 0;
                const closedAtBlock = Number(stake.closedAtBlock) || 0;

                if (!entry.startTx && createdAtBlock > 0) {
                    entry.startTx = await queryStakeStartTxHash(
                        client,
                        stake.id,
                        stakerAddress,
                        createdAtBlock,
                    );
                }

                if (!entry.endTx && closedAtBlock > 0) {
                    entry.endTx = await queryStakeEndTxHash(
                        client,
                        stake.id,
                        stakerAddress,
                        closedAtBlock,
                    );
                }

                if (entry.startTx || entry.endTx) {
                    map[stakeKey] = entry;
                }
            }),
        );
    }

    return map;
}

export function getMainnetPublicClient(options?: { batchReads?: boolean }) {
    return createPublicClient({
        chain: mainnet,
        transport: readRpcTransport(mainnet.id),
        // CCIP gateways use ordinary HTTP outside the RPC transport. Do not let
        // an ENS lookup silently send wallet-linked calldata around Nym.
        ccipRead: privateReadsEnabled() ? false : undefined,
        batch: options?.batchReads ? { multicall: true } : undefined,
    });
}
