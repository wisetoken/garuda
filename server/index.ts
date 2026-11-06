import { createApp } from './app';
import { runMaintenance } from './maintenance';
import { serve } from '@hono/node-server';
import { serviceResolver } from './market/runtime';

const resolvers=[serviceResolver('signature'),serviceResolver('advanced')];
const app=createApp({resolvers});
const server=serve({fetch:app.fetch,hostname:process.env.GARUDA_API_HOST ?? '127.0.0.1',port:Number(process.env.GARUDA_API_PORT ?? 3213)});
console.log('Garuda market API ready.');
let stopped=false;
let timer: ReturnType<typeof setTimeout>;
async function tick() {
  if (!stopped) await runMaintenance(resolvers);
  if(!stopped) timer=setTimeout(tick,15000);
}
void tick();
async function shutdown() {
  stopped=true; clearTimeout(timer); server.close();
  for(const resolve of resolvers) { const service=await resolve().catch(()=>null); await service?.store.pool.end(); }
}
process.once('SIGINT',()=>void shutdown());
process.once('SIGTERM',()=>void shutdown());
