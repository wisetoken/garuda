import { arkivReadOptions, inFlightOnly, arkivDiscoveryFailure } from "./arkiv-reads";
import { extendOfferMessage } from "../../src/lib/market/arkiv-extension";
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { u64 } from "@arkiv-network/sdk/schema";
import { and, eq, gt, asc, desc } from "@arkiv-network/sdk/query";
import { bytesToHex, http, verifyMessage, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SalesError } from "../../src/lib/blend/sales";
import type { SalesService } from "./service";
import { ArkivListings, ArkivListingsV1, arkivScope, orderAttributes, parseOrderEntity } from "./arkiv-schema";
import { readOrderMetadata } from "./arkiv-metadata";
import { parseArkivFilters, orderFilters, includeLegacy, type ArkivFilters } from "./arkiv-filters";
export { ArkivListings, ArkivListingsV1, arkivScope } from "./arkiv-schema";

function createArkivRuntime(env: NodeJS.ProcessEnv) {
  const key = env.ARKIV_PUBLISHER_PRIVATE_KEY;
  const account = key && /^0x[0-9a-f]{64}$/i.test(key) ? privateKeyToAccount(key as Hex) : undefined;
  const publisher = account?.address ?? env.ARKIV_PUBLISHER_ADDRESS;
  if (!publisher || !/^0x[0-9a-f]{40}$/i.test(publisher)) return null;
  const chain = rabdi({ accessKey: env.ARKIV_ACCESS_KEY ?? "" });
  const transport = http(undefined, { timeout: 12_000, retryCount: 0 });
  return { publisher: publisher as Hex, chain, reader: createPublicClient({chain,transport: http(undefined, arkivReadOptions)}),
    writer: account ? createWalletClient({chain,transport,account}) : undefined };
}

let cachedRuntime: ReturnType<typeof createArkivRuntime> | undefined;
export function arkivRuntime(env = process.env) {
  if (env !== process.env) return createArkivRuntime(env);
  if (cachedRuntime === undefined) cachedRuntime = createArkivRuntime(env);
  return cachedRuntime;
}

type DiscoveryResult = Awaited<ReturnType<typeof readArkivOrders>>;
const discoveryRequests = new WeakMap<SalesService, WeakMap<NonNullable<ReturnType<typeof arkivRuntime>>, ReturnType<typeof inFlightOnly<DiscoveryResult>>>>();
export async function discoverArkiv(service: SalesService, input: ArkivFilters, runtime = arkivRuntime(), preview = false) {
  if (!runtime) throw new SalesError("arkiv-disabled", "Arkiv discovery is not configured.");
  const filters = parseArkivFilters(input);
  let byRuntime = discoveryRequests.get(service);
  if (!byRuntime) { byRuntime = new WeakMap(); discoveryRequests.set(service, byRuntime); }
  let run = byRuntime.get(runtime);
  if (!run) { run = inFlightOnly<DiscoveryResult>(); byRuntime.set(runtime, run); }
  const key = JSON.stringify([preview, Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))]);
  // No cached catalog substitution: the source remains Arkiv even during outages.
  return run(key, () => readArkivOrders(service, filters, runtime, preview));
}
async function readArkivOrders(service: SalesService, input: ArkivFilters, runtime = arkivRuntime(), preview = false) {
  try { return await discoverArkivRows(service, input, runtime, preview); }
  catch (error) {
    let cause: unknown = error;
    for (let depth = 0; cause && typeof cause === "object" && depth < 5; depth++) {
      const details = cause as { status?: number; cause?: unknown };
      if (details.status === 429) throw new SalesError("rate-limit", "Arkiv's RPC is rate limiting discovery. Try the order catalog or retry later.");
      cause = details.cause;
    }
    throw error;
  }
}

async function discoverArkivRows(service: SalesService, input: ArkivFilters, runtime = arkivRuntime(), preview = false) {
  if (!runtime) throw new SalesError("arkiv-disabled", "Arkiv discovery is not configured.");
  const filters = parseArkivFilters(input);
  if (!(await service.store.limit("arkiv-read", 60))) throw new SalesError("rate-limit", "Arkiv is busy. Try again shortly.");
  if (await runtime.reader.getChainId().catch(error => { throw arkivDiscoveryFailure(error); }) !== 7794095) throw new Error("Arkiv Rabdi required.");
  let legacy = filters.before?.startsWith("v1:") ?? false;
  let offset = Number(filters.before?.replace("v1:", "") ?? 0);
  const canReadLegacy = includeLegacy(filters);
  const readLegacy = () => runtime.reader.select().from(ArkivListingsV1)
    .where(and(eq("scope", arkivScope(service.store.deployment)), eq("collection", service.store.deployment.collection.toLowerCase()),
      gt("expires", u64(BigInt(Math.floor(Date.now()/1000)))),
      ...(filters.maker ? [eq("maker", filters.maker.toLowerCase())] : []),
      ...(filters.kind ? [eq("kind", filters.kind)] : []), ...(filters.tokenId ? [eq("tokenId", filters.tokenId)] : [])))
    .ownedBy(runtime.publisher).orderBy(asc("orderHash")).limit(25).offset(offset).fetch();
  const readV2 = () => runtime.reader.select().from(ArkivListings).where(orderFilters(service.store.deployment, filters))
    .ownedBy(runtime.publisher).orderBy((filters.direction === "desc" ? desc : asc)(filters.sort ?? "price"))
    .limit(25).offset(offset).fetch();
  const read = async <T,>(query: () => Promise<T>) => { try { return await query(); } catch (error) { throw arkivDiscoveryFailure(error); } };
  let result = legacy ? (canReadLegacy ? await read(readLegacy) : { entities: [] }) : await read(readV2);
  if (!legacy && result.entities.length === 0 && canReadLegacy) {
    legacy = true; offset = 0; result = await read(readLegacy);
  }
  const [block, snapshots] = await Promise.all([preview ? null : service.snapshot(), service.store.stakeSnapshots?.() ?? []]);
  const orders = [], seen = new Set<string>();
  const candidates = [];

  for (const entity of result.entities) {
    let parsed;
    try { parsed = parseOrderEntity(entity, service.store.deployment, legacy ? 1 : 2); }
    catch { continue; }
    if (seen.has(parsed.hash) || Number(parsed.signed.order.deadline) <= Date.now()/1000) continue;
    if (legacy) {
      // V1 remains readable, but a valid v2 copy takes its place instead of showing twice.
      const newer = await runtime.reader.select().from(ArkivListings)
        .where(and(eq("scope", arkivScope(service.store.deployment)), eq("orderHash", parsed.hash)))
        .ownedBy(runtime.publisher).limit(1).fetch();
      if (newer.entities.some(candidate => {
        try { return parseOrderEntity(candidate, service.store.deployment, 2).hash === parsed.hash; } catch { return false; }
      })) continue;
    }
    seen.add(parsed.hash);
    const stored = await service.store.get(parsed.hash);
    // Keep the original Ethereum anchor: republication cannot revive a stale signature.
    if (!stored || JSON.stringify(stored.order) !== JSON.stringify(parsed.signed.order)) continue;
    const local = snapshots.find(s => s.collection.toLowerCase() === stored.order.collection.toLowerCase()
      && s.owner.toLowerCase() === stored.order.owner.toLowerCase() && s.tokenId === stored.order.tokenId);
    const snapshot = local && local.observedAt > (parsed.stakeSnapshot?.observedAt ?? 0) ? local : parsed.stakeSnapshot;
    candidates.push({stored,entityKey:entity.$key,snapshot});
  }
  // Bounded parallel checks allow viem to combine independent contract reads.
  for (let i=0; i<candidates.length; i+=4) {
    orders.push(...await Promise.all(candidates.slice(i,i+4).map(async ({stored,entityKey,snapshot}) => ({
      ...(block ? await service.status(stored,block) : {...stored,status:"checking" as const}), arkivEntity:entityKey, stakeSnapshot:snapshot,
    }))));
  }
  if (block && (await service.client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error("Chain changed during discovery.");
  const nextCursor = result.entities.length === 25 ? `${legacy ? "v1:" : ""}${offset+25}` : (!legacy && canReadLegacy ? "v1:0" : null);
  return { orders, nextCursor, blockNumber: block ? String(block.number) : "", blockHash: block?.hash,
    activity: await service.store.activity(), source: "arkiv" };
}

export async function publishArkiv(service: SalesService, hash: string, runtime = arkivRuntime(), readMetadata = readOrderMetadata) {
  if (!runtime?.writer) throw new SalesError("arkiv-disabled", "Arkiv publication is not configured.");
  const writer = runtime.writer;
  if (await runtime.reader.getChainId() !== 7794095) throw new Error("Arkiv Rabdi required.");
  if (service.store.deployment.environment !== "ethereum-mainnet") throw new Error("Only Ethereum orders can be published to Rabdi.");
  if (!(await service.store.limit("arkiv-publish", 6))) throw new SalesError("rate-limit", "Please wait before publishing another Arkiv order.");
  return service.store.transaction(async db => {
    const lock = await db.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked", [`arkiv:${runtime.publisher.toLowerCase()}`]);
    if (!lock.rows[0].locked) throw new SalesError("busy", "Another Arkiv publication is pending. Try again shortly.");
    const row = await service.get(hash);
    if (row.status !== "available") throw new SalesError("order-unavailable", `Order is ${row.status}.`);
    const scope = arkivScope(service.store.deployment);
    const existing = await runtime.reader.select().from(ArkivListings)
      .where(and(eq("scope", scope), eq("orderHash", hash))).ownedBy(runtime.publisher).limit(1).fetch();
    if (existing.entities.length) {
      const entity = existing.entities[0];
      if (parseOrderEntity(entity, service.store.deployment, 2).hash !== hash)
        throw new Error("Existing Arkiv entity does not match the signed order.");
      return { entityKey: entity.$key, created: false };
    }
    const expires = BigInt(row.order.deadline), now = BigInt(Math.floor(Date.now()/1000));
    if (expires <= now || expires > now+30n*86400n) throw new Error("Unsupported Arkiv order lifetime.");
    const metadata = await readMetadata(service, row);
    // Slow metadata reads may cross an expiry or a cancellation. Recheck before spending gas.
    const checked = await service.get(hash);
    if (checked.status !== "available") throw new SalesError("order-unavailable", `Order is ${checked.status}.`);
    const attributes = orderAttributes(row, service.store.deployment, metadata);
    const result = await writer.createEntity(ArkivListings, attributes,
      { expiration: ExpirationTime.atDate(new Date(Number(expires)*1000)) });
    const readBack = await runtime.reader.getEntity(result.entityKey, ArkivListings);
    try {
      if (parseOrderEntity(readBack, service.store.deployment, 2).hash !== hash) throw new Error("Wrong order.");
      for (const [name, expected] of Object.entries(attributes)) {
        const actual = readBack[name as keyof typeof attributes]?.value;
        const bare = typeof expected === "string" ? expected : expected instanceof Uint8Array ? bytesToHex(expected) : expected.value;
        if (actual !== bare) throw new Error("Write read-back differs.");
      }
    } catch { throw new Error("Arkiv write could not be verified. Check publication before retrying."); }
    return { entityKey: result.entityKey, txHash: result.txHash, expiresAt: String(result.expiresAt), created: true };
  });
}

export { extendOfferMessage } from "../../src/lib/market/arkiv-extension";

export async function arkivLifetime(service: SalesService, hash: string, entityKey: string, runtime = arkivRuntime()) {
  if (!runtime || !/^0x[0-9a-f]{64}$/i.test(entityKey)) throw new SalesError("invalid-request", "Arkiv entity unavailable.");
  const entity = await runtime.reader.getEntity(entityKey as Hex, ArkivListings);
  if (parseOrderEntity(entity, service.store.deployment, 2).hash !== hash) throw new Error("Arkiv entity does not match the order.");
  return { expiresBlock: String(entity.$expiresAt) };
}

export async function extendArkiv(service: SalesService, hash: string, entityKey: string, signature: string, expiresAt: number, runtime = arkivRuntime()) {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now()/1000) || expiresAt > Math.floor(Date.now()/1000) + 90*86400) throw new SalesError("invalid-request", "Choose a storage expiry within the next 90 days.");
  if (!runtime?.writer) throw new SalesError("arkiv-disabled", "Arkiv publication is not configured.");
  if (!/^0x[0-9a-f]{64}$/i.test(entityKey) || !/^0x[0-9a-f]+$/i.test(signature))
    throw new SalesError("invalid-request", "Invalid extension request.");
  if (await runtime.reader.getChainId() !== 7794095) throw new Error("Arkiv Rabdi required.");
  if (service.store.deployment.environment !== "ethereum-mainnet") throw new Error("Only Ethereum orders can be published to Rabdi.");
  if (!(await service.store.limit("arkiv-extend", 6))) throw new SalesError("rate-limit", "Please wait before extending another Arkiv offer.");
  const row = await service.get(hash);
  if (row.status !== "available") throw new SalesError("order-unavailable", `Order is ${row.status}.`);
  const ownerSigned = await verifyMessage({
    address: row.order.owner as Hex,
    message: extendOfferMessage(hash, entityKey, expiresAt),
    signature: signature as Hex,
  }).catch(() => false);
  if (!ownerSigned) throw new SalesError("not-owner", "Only the stake owner can extend this Arkiv offer.");
  const entity = await runtime.reader.getEntity(entityKey as Hex, ArkivListings);
  if (parseOrderEntity(entity, service.store.deployment, 2).hash !== hash)
    throw new Error("Arkiv entity does not match the signed order.");
  const result = await runtime.writer.extendEntity({
    entityKey: entityKey as Hex,
    expiration: ExpirationTime.atDate(new Date(expiresAt * 1000)),
  });
  return { entityKey: result.entityKey, txHash: result.txHash, expiresAt: String(result.expiresAt) };
}
