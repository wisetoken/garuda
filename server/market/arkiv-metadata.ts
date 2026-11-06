import { getAddress } from "viem";
import { loadSignaturePortfolio } from "../../src/lib/blend/live-portfolio";
import { readSaleAsset } from "../../src/lib/blend/sales-chain";
import { sameAddress, type SaleRow } from "../../src/lib/blend/sales";
import { snapshotFromPortfolio } from "../../src/lib/blend/stake-snapshot";
import type { SalesService } from "./service";
import type { OrderMetadata } from "./arkiv-schema";

export async function readOrderMetadata(service: SalesService, row: SaleRow): Promise<OrderMetadata> {
  const o = row.order;
  const portfolio = await loadSignaturePortfolio(service.client, o.owner, 1, getAddress(o.collection), [o.tokenId]);
  const snapshot = snapshotFromPortfolio(portfolio);
  const asset = await readSaleAsset(service.client, service.store.deployment, BigInt(o.tokenId), portfolio.blockNumber);
  if (!sameAddress(asset.owner, o.owner) || asset.stakeId !== o.stakeId || asset.stateHash !== o.stateHash ||
    asset.epoch !== BigInt(o.epoch) || !snapshot.canList || snapshot.stakeId !== o.stakeId ||
    asset.maturesAt !== BigInt(snapshot.maturesAt)) throw new Error("Stake changed before Arkiv publication.");
  const original = await service.store.pool.query(
    'SELECT floor(extract(epoch FROM created_at))::text AS published_at FROM blend_sale_orders WHERE scope=$1 AND hash=$2',
    [service.store.scope, row.hash]);
  const publishedAt = Number(original.rows[0]?.published_at);
  if (!Number.isSafeInteger(publishedAt) || publishedAt <= 0) throw new Error("Original publication time unavailable.");
  if ((await service.client.getBlock({ blockNumber: portfolio.blockNumber })).hash !== portfolio.blockHash)
    throw new Error("Stake snapshot block changed.");
  return { snapshot, publishedAt, indexedAt: Math.floor(Date.now()/1000) };
}
