import { processMediaBackup } from './media/publication';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { registerMarketRoutes } from './market/routes';
import { serviceResolver } from './market/runtime';
import { processPublication } from './market/publication';
import { processStakeSnapshot } from './market/stake-cache';

const app=new Hono();
const resolvers=[serviceResolver('signature'),serviceResolver('advanced')];
registerMarketRoutes(app,resolvers[0]);
registerMarketRoutes(app,resolvers[1],'/api/garuda/advanced');
app.get('/health',c=>c.json({service:'garuda-market',ok:true}));
const server=serve({fetch:app.fetch,hostname:process.env.GARUDA_API_HOST ?? '127.0.0.1',port:Number(process.env.GARUDA_API_PORT ?? 3213)});
console.log('Garuda market API ready.');
let stopped=false;
let timer: ReturnType<typeof setTimeout>;
async function tick() {
  for (const resolve of resolvers) {
    if(stopped) break;
    try { const service=await resolve(); if(service) { await processPublication(service); await processStakeSnapshot(service); } }
    catch { console.error('Garuda publication worker will retry.'); }
    try { const service=await resolve(); if(service && !stopped) await processMediaBackup(service); }
    catch { console.error('Garuda artwork backup is not configured or unavailable.'); }
  }
  if(!stopped) timer=setTimeout(tick,15000);
}
void tick();
async function shutdown() {
  stopped=true; clearTimeout(timer); server.close();
  for(const resolve of resolvers) { const service=await resolve().catch(()=>null); await service?.store.pool.end(); }
}
process.once('SIGINT',()=>void shutdown());
process.once('SIGTERM',()=>void shutdown());
