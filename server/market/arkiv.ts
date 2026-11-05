import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { defineSchema, str, bytes, u64 } from "@arkiv-network/sdk/schema";
import { and, eq, gt } from "@arkiv-network/sdk/query";
import { hexToString, http, stringToBytes, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deploymentScope, parseSignedSale, SalesError } from "../../src/lib/blend/sales";
import type { SalesService } from "./service";

export const arkivScope = (deployment: Parameters<typeof deploymentScope>[0]) => keccak256(stringToBytes(deploymentScope(deployment)));

export const ArkivListings = defineSchema("wiseone.garuda.orders.v1", {
  scope: str().indexed(), orderHash: str().indexed(), maker: str().indexed(), owner: str().indexed(), kind: str().indexed(),
  collection: str().indexed(), tokenId: str().indexed(), format: str().indexed(),
  expires: u64().indexed(), envelope: bytes(),
});
function createArkivRuntime(env: NodeJS.ProcessEnv) {
  const key = env.ARKIV_PUBLISHER_PRIVATE_KEY;
  const account = key && /^0x[0-9a-f]{64}$/i.test(key) ? privateKeyToAccount(key as Hex) : undefined;
  const publisher = account?.address ?? env.ARKIV_PUBLISHER_ADDRESS;
  if (!publisher || !/^0x[0-9a-f]{40}$/i.test(publisher)) return null;
  const chain = rabdi({ accessKey: env.ARKIV_ACCESS_KEY ?? "" });
  const transport = http(undefined, { timeout: 12_000, retryCount: 0 });
  return { publisher: publisher as Hex, chain, reader: createPublicClient({chain,transport}),
    writer: account ? createWalletClient({chain,transport,account}) : undefined };
}

let cachedRuntime: ReturnType<typeof createArkivRuntime> | undefined;
export function arkivRuntime(env = process.env) {
  if (env !== process.env) return createArkivRuntime(env);
  if (cachedRuntime === undefined) cachedRuntime = createArkivRuntime(env);
  return cachedRuntime;
}

export async function discoverArkiv(service: SalesService, filters: { maker?: string; tokenId?: string; before?: string; kind?: "listing" | "bid" }, runtime = arkivRuntime()) {
  if (!runtime) throw new SalesError("arkiv-disabled", "Arkiv discovery is not configured.");
  if (!(await service.store.limit("arkiv-read", 60))) throw new SalesError("rate-limit", "Arkiv is busy. Try again shortly.");
  const offset = filters.before ? Number(filters.before) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) throw new Error("Invalid Arkiv page.");
  const conditions = [eq("scope", arkivScope(service.store.deployment)), gt("expires", u64(BigInt(Math.floor(Date.now()/1000)))),
    ...(filters.maker ? [eq("maker", filters.maker.toLowerCase())] : []),
    ...(filters.kind ? [eq("kind", filters.kind)] : []),
    ...(filters.tokenId ? [eq("tokenId", filters.tokenId)] : [])];
  const result = await runtime.reader.select().from(ArkivListings).where(and(...conditions))
    .ownedBy(runtime.publisher).limit(25).offset(offset).fetch();
  if (await runtime.reader.getChainId() !== 7794095) throw new Error("Arkiv Rabdi required.");
  const block = await service.snapshot();
  const orders = [];
  const seen = new Set<string>();
  for (const entity of result.entities) {
    // Arkiv attributes and payload are discovery hints, never purchase authority.
    let parsed;
    try { parsed = parseSignedSale(JSON.parse(hexToString(entity.envelope.value)), service.store.deployment); }
    catch { continue; }
    if (parsed.hash !== entity.orderHash?.value || seen.has(parsed.hash)) continue;
    const order = parsed.signed.order;
    if (entity.scope?.value !== arkivScope(service.store.deployment) ||
        entity.format?.value !== "seaport-1.6" ||
        entity.kind?.value !== (order.kind === 0 ? "listing" : "bid") ||
        entity.maker?.value !== order.maker.toLowerCase() || entity.owner?.value !== order.owner.toLowerCase() ||
        entity.collection?.value !== order.collection.toLowerCase() || entity.tokenId?.value !== order.tokenId ||
        entity.expires?.value !== BigInt(order.deadline) || Number(order.deadline) <= Date.now()/1000) continue;
    seen.add(parsed.hash);
    const stored = await service.store.get(parsed.hash);
    // Preserve the original publication anchor. A re-published entity must not
    // make a transferred-away-and-back NFT's stale signature appear fresh.
    if (!stored || JSON.stringify(stored.order) !== JSON.stringify(parsed.signed.order)) continue;
    orders.push({...await service.status(stored, block), arkivEntity: entity.$key});
  }
  if ((await service.client.getBlock({blockNumber:block.number})).hash !== block.hash) throw new Error("Chain changed during discovery.");
  return { orders, nextCursor: result.entities.length === 25 ? String(offset+25) : null,
    blockNumber:String(block.number), blockHash:block.hash, activity:await service.store.activity(), source:"arkiv" };
}

export async function publishArkiv(service: SalesService, hash: string, runtime = arkivRuntime()) {
  if (!runtime?.writer) throw new SalesError("arkiv-disabled", "Arkiv publication is not configured.");
  const writer = runtime.writer;
  if (await runtime.reader.getChainId() !== 7794095) throw new Error("Arkiv Rabdi required.");
  if (service.store.deployment.environment !== "ethereum-mainnet") throw new Error("Only Ethereum orders can be published to Rabdi.");
  if (!(await service.store.limit("arkiv-publish", 6))) throw new SalesError("rate-limit", "Please wait before publishing another Arkiv order.");
  return service.store.transaction(async db => {
    // A dedicated publisher may serve multiple collections. Serialize its nonce
    // across server processes and check for existing entities before spending gas.
    const lock = await db.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked", [`arkiv:${runtime.publisher.toLowerCase()}`]);
    if (!lock.rows[0].locked) throw new SalesError("busy", "Another Arkiv publication is pending. Try again shortly.");
    const row = await service.get(hash);
    if (row.status !== "available") throw new SalesError("order-unavailable", `Order is ${row.status}.`);
    const scope = arkivScope(service.store.deployment);
    const existing = await runtime.reader.select().from(ArkivListings)
      .where(and(eq("scope",scope),eq("orderHash",hash))).ownedBy(runtime.publisher).limit(1).fetch();
    if (existing.entities.length) {
      const entity = existing.entities[0];
      const saved = parseSignedSale(JSON.parse(hexToString(entity.envelope.value)), service.store.deployment);
      if (saved.hash !== hash || entity.expires.value !== BigInt(row.order.deadline))
        throw new Error("Existing Arkiv entity does not match the signed order.");
      return { entityKey:entity.$key, created:false };
    }
    const expires = BigInt(row.order.deadline);
    const now = BigInt(Math.floor(Date.now()/1000));
    if (expires <= now || expires > now+30n*86400n) throw new Error("Unsupported Arkiv order lifetime.");
    const signed = {order:row.order,signature:row.signature};
    const result = await writer.createEntity(ArkivListings, {
      scope, orderHash:hash, maker:row.order.maker.toLowerCase(), owner:row.order.owner.toLowerCase(), kind:row.order.kind === 0 ? "listing" : "bid", collection:row.order.collection.toLowerCase(),
      tokenId:row.order.tokenId, format:"seaport-1.6", expires:u64(expires), envelope:stringToBytes(JSON.stringify(signed)),
    }, {expiration:ExpirationTime.atDate(new Date(Number(expires)*1000))});
    const readBack = await runtime.reader.getEntity(result.entityKey,ArkivListings);
    const saved = parseSignedSale(JSON.parse(hexToString(readBack.envelope.value)), service.store.deployment);
    if (readBack.orderHash.value !== hash || saved.hash !== hash || readBack.expires.value !== expires) throw new Error("Arkiv write could not be verified. Check publication before retrying.");
    return {entityKey:result.entityKey,txHash:result.txHash,expiresAt:String(result.expiresAt),created:true};
  });
}
