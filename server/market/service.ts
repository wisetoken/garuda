import type { PublicClient } from "viem";
import {
    parseSignedSale,
    SalesError,
    type SaleRow,
} from "../../src/lib/blend/sales";
import {
    verifySalesDeployment,
    verifySignedSale,
} from "../../src/lib/blend/sales-chain";
import { SaleStore, type StoredSale } from "./store";
import { syncSalesIndex } from "./indexer";
import { parseStakeSnapshot } from '../../src/lib/blend/stake-snapshot';

export class SalesService {
    private pendingSnapshot?: ReturnType<typeof verifySalesDeployment>;
    constructor(
        readonly client: PublicClient,
        readonly store: SaleStore,
    ) {}
    snapshot() {
        // Config and order queries load together. Share only the in-flight
        // verification/index refresh so they cannot contend with each other.
        // Clear on both success and failure; subsequent requests verify afresh.
        if (!this.pendingSnapshot)
            this.pendingSnapshot = this.readSnapshot().finally(() => {
                this.pendingSnapshot = undefined;
            });
        return this.pendingSnapshot;
    }
    private async readSnapshot() {
        const block = await verifySalesDeployment(
            this.client,
            this.store.deployment,
        );
        const indexed = await syncSalesIndex(
            this.client,
            this.store,
            block.number,
        );
        if (!indexed.caughtUp)
            throw new SalesError(
                "index-catching-up",
                "The market is catching up with Ethereum. Try again shortly.",
            );
        return block;
    }
    async status(
        row: StoredSale,
        block: Awaited<ReturnType<SalesService["snapshot"]>>,
    ): Promise<SaleRow> {
        if (BigInt(row.publishedBlock) > block.number)
            return { ...row, status: "reorged" };
        const anchor = await this.client.getBlock({
            blockNumber: BigInt(row.publishedBlock),
        });
        if (anchor.hash !== row.publishedBlockHash)
            return { ...row, status: "reorged" };
        // A canonical settlement of this exact order takes precedence over the
        // NFT transfer it caused, later expiry, or subsequent ownership changes.
        if (
            await this.store.soldSince(
                row.hash,
                row.order.tokenId,
                row.publishedBlock,
                String(block.number),
            )
        )
            return { ...row, status: "sold" };
        if (
            await this.store.transferredSince(
                row.order.tokenId,
                row.publishedBlock,
                String(block.number),
            )
        )
            return { ...row, status: "transferred" };
        try {
            const result = await verifySignedSale(
                this.client,
                this.store.deployment,
                row,
                block,
            );
            return { ...row, status: result.status };
        } catch (error) {
            if (
                error instanceof SalesError &&
                error.code === "invalid-signature"
            )
                return { ...row, status: "signature-invalid" };
            throw error;
        }
    }
    async get(hash: string) {
        if (!(await this.store.limit("read", 300)))
            throw new SalesError(
                "rate-limit",
                "Market is busy. Try again shortly.",
            );
        const block = await this.snapshot();
        const row = await this.store.get(hash);
        if (!row)
            throw new SalesError(
                "not-found",
                "This order is not published in this market.",
            );
        const result = await this.status(row, block);
        if (
            (await this.client.getBlock({ blockNumber: block.number })).hash !==
            block.hash
        )
            throw new SalesError("reorg", "Chain changed. Retry.");
        await this.store.saveAvailability?.([result], block.number);
        return result;
    }
    async publish(raw: unknown) {
        const parsed = parseSignedSale(raw, this.store.deployment); // cheap schema checks before RPC
        if (!(await this.store.limit("publish", 120)))
            throw new SalesError(
                "rate-limit",
                "Too many orders. Try again in a minute.",
            );
        const block = await this.snapshot();
        const result = await verifySignedSale(
            this.client,
            this.store.deployment,
            parsed.signed,
            block,
        );
        if (result.status !== "available")
            throw new SalesError(
                "order-unavailable",
                `Order is ${result.status}. Refresh its terms or approvals.`,
            );
        if (
            (await this.client.getBlock({ blockNumber: block.number })).hash !==
            block.hash
        )
            throw new SalesError("reorg", "Chain changed. Please retry.");
        if (!(await this.store.limit(`maker:${parsed.order.maker}`, 12)))
            throw new SalesError(
                "rate-limit",
                "Too many orders from this wallet. Try again in a minute.",
            );
        const created = await this.store.publish(
            parsed.signed,
            parsed.hash,
            block.number,
            block.hash!,
        );
        const rows = await this.store.list({
            maker: parsed.order.maker,
            tokenId: parsed.signed.order.tokenId,
            limit: 100,
        });
        const row = rows.find((r) => r.hash === parsed.hash);
        if (!row)
            throw new SalesError("storage", "Order could not be read back.");
        const verified = await this.status(row, block);
        if (verified.status !== "available")
            throw new SalesError(
                "order-unavailable",
                "This signature was already invalidated. Create a fresh order.",
            );
        return { created, order: verified };
    }
    /** Display-only catalog. Never grants permission to fill an order. */
    async catalog(filters: Parameters<SaleStore["list"]>[0]) {
        if (!(await this.store.limit("catalog-read", 300)))
            throw new SalesError("rate-limit", "Market is busy. Try again shortly.");
        const rows = await this.store.list(filters);
        const snapshots = await this.store.stakeSnapshots();
        const availability = await this.store.availability?.(rows.map(row=>row.hash));
        return {
            orders: rows.filter(row => filters?.maker || !availability?.has(row.hash) || ["available","expired"].includes(availability.get(row.hash)!)).map(row => {
                let stakeSnapshot;
                const candidate=snapshots.find(s=>s.collection.toLowerCase()===row.order.collection.toLowerCase()&&s.owner.toLowerCase()===row.order.owner.toLowerCase()&&s.tokenId===row.order.tokenId);
                try { stakeSnapshot=parseStakeSnapshot(candidate,row.order,Math.floor(Date.now()/1000),86400); } catch { /* Background detail refresh supplies missing snapshots. */ }
                return {...row,stakeSnapshot,status:Number(row.order.deadline)<=Date.now()/1000 ? "expired" as const : "checking" as const};
            }),
            nextCursor: rows.length === 25 ? rows[rows.length-1].sequence : null,
            blockNumber: "", activity: [],
        };
    }
    async list(filters: Parameters<SaleStore["list"]>[0]) {
        if (!(await this.store.limit("read", 300)))
            throw new SalesError(
                "rate-limit",
                "Market is busy. Try again shortly.",
            );
        const block = await this.snapshot();
        const rows = await this.store.list(filters);
        const orders: SaleRow[] = [];
        for (let i = 0; i < rows.length; i += 4)
            orders.push(
                ...(await Promise.all(
                    rows.slice(i, i + 4).map((row) => this.status(row, block)),
                )),
            );
        if (
            (await this.client.getBlock({ blockNumber: block.number })).hash !==
            block.hash
        )
            throw new SalesError("reorg", "Chain changed. Please retry.");
        await this.store.saveAvailability?.(orders, block.number);
        return {
            orders,
            nextCursor:
                rows.length === 25 ? rows[rows.length - 1].sequence : null,
            blockNumber: String(block.number),
            blockHash: block.hash,
            activity: await this.store.activity(),
        };
    }
}
