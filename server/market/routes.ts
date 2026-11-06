import { legacyTradingRetired } from "../../src/lib/blend/sales-migration";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { isAddress } from "viem";
import { SalesError, parseSignedSale } from "../../src/lib/blend/sales";
import type { SalesService } from "./service";
import { zoneAbi } from "../../src/lib/blend/seaport";
import { parseArkivFilters } from "./arkiv-filters";
import { publicationStates } from "./publication";

export function registerMarketRoutes(
  app: Hono,
  resolve: () => Promise<SalesService | null> ,
  prefix = "/api/garuda",
) {
  app.use(
    `${prefix}/*`,
    bodyLimit({
      maxSize: 16_384,
      onError: (c) => c.json({ error: "Request is too large." }, 413),
    }),
  );
  app.use(`${prefix}/*`, async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.get(`${prefix}/media/:hash`, async c => {
    const hash = c.req.param('hash').toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) return c.json({error:'Invalid order hash.'},400);
    try {
      const service=await resolve();
      if (!service) return c.json({error:'Market unavailable.'},503);
      if (!(await service.store.get(hash))) return c.json({error:'Order not found.'},404);
      const {mediaStatus}=await import('../media/publication');
      return c.json(await mediaStatus(service.store,hash));
    } catch { return c.json({error:'Artwork backup status unavailable.'},503); }
  });
  app.get(`${prefix}/stake-details/:hash`, async c => {
    const hash = c.req.param('hash').toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) return c.json({error:'Invalid order hash.'},400);
    try {
      const service = await resolve();
      if (!service) return c.json({error:'Market unavailable.'},503);
      const {getStakeDetails} = await import('./stake-cache');
      return c.json(await getStakeDetails(service, hash));
    } catch (e) {
      return c.json({error:e instanceof SalesError ? e.message : 'Stake details could not be loaded.'},503);
    }
  });
  app.get(`${prefix}/arkiv/config`, async c => {
    const { arkivRuntime } = await import("./arkiv");
    const runtime = arkivRuntime();
    return c.json({enabled:Boolean(runtime),canPublish:Boolean(runtime?.writer),publisher:runtime?.publisher,chainId:7794095});
  });
  app.get(`${prefix}/arkiv/status/:hash`, async c => {
    const hash = c.req.param("hash").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) return c.json({error:"Invalid order hash."},400);
    try {
      const service = await resolve();
      if (!service) return c.json({error:"Market unavailable."},503);
      if (!(await service.store.limit("publication-status",120))) return c.json({error:"Please retry shortly."},429);
      if (!(await service.store.get(hash))) return c.json({error:"Order not found."},404);
      const states = await publicationStates(service.store,[hash]);
      return c.json({orderHash:hash,publication:states.get(hash) ?? null});
    } catch { return c.json({error:"Publication status unavailable."},503); }
  });
  app.get(`${prefix}/arkiv/:hash/lifetime`, async c => {
    const hash = c.req.param("hash").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) return c.json({error:"Invalid order hash."},400);
    try {
      const service = await resolve();
      if (!service) return c.json({error:"Market unavailable."},503);
      const {arkivLifetime} = await import("./arkiv");
      return c.json(await arkivLifetime(service, hash, c.req.query("entityKey") ?? ""));
    } catch { return c.json({error:"Current Arkiv expiry could not be loaded."},503); }
  });
  app.post(`${prefix}/arkiv/:hash/extend`, async c => {
    const hash = c.req.param("hash").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) return c.json({error:"Invalid order hash."},400);
    let body: { entityKey?: unknown; signature?: unknown; expiresAt?: unknown };
    try { body = await c.req.json(); } catch { return c.json({error:"Invalid extension request."},400); }
    try {
      const service = await resolve();
      if (!service) return c.json({error:"Market unavailable."},503);
      const {extendArkiv} = await import("./arkiv");
      return c.json(await extendArkiv(service, hash, String(body.entityKey ?? ""), String(body.signature ?? ""), Number(body.expiresAt)));
    } catch (e) {
      const code = e instanceof SalesError ? e.code : "";
      const status = code === "not-owner" || code === "not-maker" ? 403 : code === "invalid-request" ? 400 : code === "rate-limit" ? 429 : code === "order-unavailable" ? 409 : 503;
      return c.json({error:e instanceof SalesError ? e.message : "Arkiv offer could not be extended. The signed order is unchanged."}, status);
    }
  });
  app.post(`${prefix}/arkiv/:hash`, async c => {
    const hash = c.req.param("hash").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) return c.json({error:"Invalid order hash."},400);
    try {
      const service = await resolve();
      if (!service) return c.json({error:"Market unavailable."},503);
      const {publishArkiv} = await import("./arkiv");
      return c.json(await publishArkiv(service,hash));
    } catch(e) {
      return c.json({error:e instanceof SalesError ? e.message : "Arkiv publication could not be confirmed. Your Ethereum listing is unchanged; check Arkiv before retrying."},503);
    }
  });
  app.get(`${prefix}/catalog-config`, async c => {
    try {
      const service=await resolve();
      return c.json(service ? {enabled:true,deployment:service.store.deployment,recoveryOnly:true} : {enabled:false,reason:'Market unavailable.'});
    } catch {return c.json({error:'Market configuration unavailable.'},503);}
  });
  app.get(`${prefix}/config`, async (c) => {
    try {
      const service = await resolve();
      if (!service)
        return c.json({
          enabled: false,
          reason:
            "The Ethereum validator deployment is not configured yet. Your wallet portfolio remains available.",
        });
      const block = await service.snapshot();
      await service.store.list({ limit: 1 });
      const newActivityPaused = await service.client.readContract({
        address: service.store.deployment.adapter,
        abi: zoneAbi,
        functionName: "newActivityPaused",
        blockNumber: block.number,
      });
      return c.json({
        enabled: true,
        deployment: service.store.deployment,
        newActivityPaused: newActivityPaused || !await legacyTradingRetired(service.client, service.store.deployment, block.number),
      });
    } catch {
      return c.json({ error: "The configured market is unavailable." }, 503);
    }
  });
  app.get(`${prefix}/catalog`, async c => {
    try {
      const service = await resolve();
      if (!service) return c.json({error:'Market unavailable.'},503);
      const maker=c.req.query('maker'),tokenId=c.req.query('tokenId'),before=c.req.query('before');
      if ((maker&&!isAddress(maker,{strict:false})) || (tokenId&&!/^(0|[1-9][0-9]{0,77})$/.test(tokenId)) || (before&&!/^[1-9][0-9]{0,17}$/.test(before)))
        return c.json({error:'Invalid market filter.'},400);
      return c.json(await service.catalog({maker,tokenId,before}));
    } catch {return c.json({error:'Market catalog unavailable.'},503);}
  });
  app.get(`${prefix}/sales`, async (c) => {
    try {
      const service = await resolve();
      if (!service) return c.json({ error: "Trading is not enabled." }, 503);
      const maker = c.req.query("maker"),
        tokenId = c.req.query("tokenId"),
        before = c.req.query("before");
      if (
        (maker && !isAddress(maker, { strict: false })) ||
        (tokenId && !/^(0|[1-9][0-9]{0,77})$/.test(tokenId)) ||
        (before && c.req.query("source") !== "arkiv" && !/^[1-9][0-9]{0,17}$/.test(before))
      )
        return c.json({ error: "Invalid market filter." }, 400);
      if (c.req.query("source") === "arkiv") {
        const kind = c.req.query("kind");
        if (kind !== undefined && kind !== "listing" && kind !== "bid") return c.json({error:"Invalid order kind."},400);
        const {discoverArkiv} = await import("./arkiv");
        return c.json(await discoverArkiv(service,parseArkivFilters(c.req.query()),undefined,c.req.query("preview") === "1"));
      }
      const book = await service.list({ maker, tokenId, before });
      const states = await publicationStates(service.store,book.orders.map(row=>row.hash));
      return c.json({...book,source:"catalog",orders:book.orders.map(row=>({...row,arkiv:states.get(row.hash)}))});
    } catch (e) {
      return c.json(
        {
          error:
            e instanceof SalesError
              ? e.message
              : "Market data could not be verified. Please retry.",
        },
        e instanceof SalesError ? (e.code === "invalid-filter" ? 400 : e.code === "rate-limit" ? 429 : 503) : 503,
      );
    }
  });
  app.get(`${prefix}/sales/:hash`, async (c) => {
    const hash = c.req.param("hash");
    if (!/^0x[0-9a-f]{64}$/i.test(hash))
      return c.json({ error: "Invalid order hash." }, 400);
    try {
      const service = await resolve();
      if (!service) return c.json({ error: "Trading is not enabled." }, 503);
      return c.json(await service.get(hash.toLowerCase()));
    } catch (e) {
      return c.json(
        {
          error:
            e instanceof SalesError
              ? e.message
              : "Order could not be verified.",
        },
        e instanceof SalesError && e.code === "not-found" ? 404 : 503,
      );
    }
  });
  app.post(`${prefix}/sales`, async (c) => {
    try {
      const service = await resolve();
      if (!service) return c.json({ error: "Trading is not enabled." }, 503);
      let raw;
      try {
        raw = await c.req.json();
        parseSignedSale(raw, service.store.deployment);
      } catch {
        return c.json({ error: "Invalid signed order." }, 400);
      }
      const result = await service.publish(raw);
      return c.json({...result,arkiv:{state:"queued"}}, result.created ? 201 : 200);
    } catch (e) {
      return c.json(
        {
          error:
            e instanceof SalesError
              ? e.message
              : "Order could not be published. Its signature may still be valid; retry or cancel it onchain.",
        },
        e instanceof SalesError ? (e.code === "rate-limit" ? 429 : 409) : 503,
      );
    }
  });
}
