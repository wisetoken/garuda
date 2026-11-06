import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { registerMarketRoutes } from './market/routes';
import { processPublication } from './market/publication';
import { serviceResolver } from './market/runtime';
import { runMaintenance, type ServiceResolver } from './maintenance';

export function validCronAuthorization(header: string | undefined, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(header);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createApp({
  resolvers = [serviceResolver('signature'), serviceResolver('advanced')],
  publish = processPublication,
  maintain = () => runMaintenance(resolvers),
  cronSecret = () => process.env.CRON_SECRET,
}: {
  resolvers?: ServiceResolver[];
  publish?: typeof processPublication;
  maintain?: () => Promise<{ failures: number }>;
  cronSecret?: () => string | undefined;
} = {}) {
  const app = new Hono();
  registerMarketRoutes(app, resolvers[0], '/api/garuda', publish);
  registerMarketRoutes(app, resolvers[1], '/api/garuda/advanced', publish);
  app.get('/health', c => c.json({ service: 'garuda-market', ok: true }));
  app.get('/api/garuda/health', async c => {
    try {
      const service = await resolvers[0]();
      if (!service) return c.json({ service: 'garuda-market', ok: false }, 503);
      await service.store.pool.query('SELECT 1');
      return c.json({ service: 'garuda-market', ok: true, chainId: service.store.deployment.chainId });
    } catch { return c.json({ service: 'garuda-market', ok: false }, 503); }
  });
  app.get('/api/cron/garuda', async c => {
    c.header('Cache-Control', 'no-store');
    if (!validCronAuthorization(c.req.header('authorization'), cronSecret()))
      return c.json({ error: 'Unauthorized' }, 401);
    try {
      const result = await maintain();
      return c.json({ ok: result.failures === 0, ...result }, result.failures ? 503 : 200);
    } catch { return c.json({ ok: false }, 503); }
  });
  app.onError((_error, c) => c.json({ error: 'Service temporarily unavailable.' }, 503));
  return app;
}
