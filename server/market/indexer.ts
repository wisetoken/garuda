import { zoneAbi } from "../../src/lib/blend/seaport";
import { decodeEventLog, type PublicClient } from "viem";
import {
    nftSalesAbi,
    SalesError,
    sameAddress,
} from "../../src/lib/blend/sales";
import { SaleStore } from "./store";

const json = (value: unknown) =>
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v));
/** Rebuild canonical event observations after a reorg. Order signatures remain immutable. */
export async function syncSalesIndex(
    client: PublicClient,
    store: SaleStore,
    head: bigint,
) {
    const d = store.deployment;
    return store.transaction(async (db) => {
        // Separate serverless instances cannot share SalesService's in-flight
        // promise. Wait for the current refresher instead of failing ordinary
        // concurrent config/order reads. Bound the wait below the API deadline.
        await db.query("SET LOCAL lock_timeout = '5s'");
        try {
            await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${store.scope}:index`]);
        } catch (error) {
            if ((error as { code?: string })?.code === '55P03')
                throw new SalesError('index-busy', 'The market is refreshing. Try again shortly.');
            throw error;
        }
        const checkpoints = await db.query(
            "SELECT block_number,block_hash FROM blend_sale_checkpoints WHERE scope=$1 ORDER BY block_number DESC",
            [store.scope],
        );
        let cursor = BigInt(d.deploymentBlock) - 1n;
        for (const point of checkpoints.rows) {
            if (
                (
                    await client.getBlock({
                        blockNumber: BigInt(point.block_number),
                    })
                ).hash === point.block_hash
            ) {
                // A newer request may finish while this one waits for the lock.
                // Its canonical index already covers our block; do not rewind it.
                if (BigInt(point.block_number) > head)
                    return { caughtUp: true, blockNumber: head };
                cursor = BigInt(point.block_number);
                break;
            }
        }
        await db.query(
            "DELETE FROM blend_sale_events WHERE scope=$1 AND block_number>$2",
            [store.scope, String(cursor)],
        );
        await db.query(
            "DELETE FROM blend_sale_checkpoints WHERE scope=$1 AND block_number>$2",
            [store.scope, String(cursor)],
        );
        // Bounded catch-up; subsequent requests/worker runs continue from the durable cursor.
        for (let batch = 0; cursor < head && batch < 5; batch++) {
            // The configured mainnet provider caps eth_getLogs at 1,000
            // blocks. A longer offline period must catch up in bounded pages.
            const end = cursor + 1000n < head ? cursor + 1000n : head;
            const before = await client.getBlock({ blockNumber: end });
            const logs = await client.getLogs({
                address: [d.adapter, d.collection],
                fromBlock: cursor + 1n,
                toBlock: end,
            });
            const after = await client.getBlock({ blockNumber: end });
            if (before.hash !== after.hash)
                throw new SalesError(
                    "reorg",
                    "Chain changed during indexing. Retry.",
                );
            for (const log of logs) {
                let decoded;
                try {
                    decoded = decodeEventLog({
                        abi: sameAddress(log.address, d.collection)
                            ? nftSalesAbi
                            : zoneAbi,
                        data: log.data,
                        topics: log.topics,
                    });
                } catch {
                    continue;
                }
                const args = decoded.args as Record<string, unknown>;
                if (
                    sameAddress(log.address, d.collection) &&
                    decoded.eventName !== "Transfer"
                )
                    continue;
                if (
                    log.blockNumber === null ||
                    log.logIndex === null ||
                    !log.blockHash ||
                    !log.transactionHash
                )
                    throw new SalesError(
                        "incomplete-logs",
                        "Incomplete event data.",
                    );
                await db.query(
                    `INSERT INTO blend_sale_events(scope,block_number,block_hash,tx_hash,log_index,event_name,token_id,payload)
                  VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
                    [
                        store.scope,
                        String(log.blockNumber),
                        log.blockHash,
                        log.transactionHash,
                        log.logIndex,
                        decoded.eventName,
                        args.tokenId === undefined
                            ? null
                            : String(args.tokenId),
                        json(args),
                    ],
                );
            }
            await db.query(
                "INSERT INTO blend_sale_checkpoints(scope,block_number,block_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                [store.scope, String(end), after.hash],
            );
            cursor = end;
        }
        return { caughtUp: cursor === head, blockNumber: cursor };
    });
}
