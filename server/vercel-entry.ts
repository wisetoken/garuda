import { handle } from '@hono/node-server/vercel';
import { attachDatabasePool, waitUntil } from '@vercel/functions';
import { createApp } from './app';
import { serviceResolver } from './market/runtime';
import { processPublication } from './market/publication';

const resolvers = [
  serviceResolver('signature', attachDatabasePool),
  serviceResolver('advanced', attachDatabasePool),
];
const app = createApp({ resolvers, publish: service => {
  const work = processPublication(service).catch(() => {
    console.error('Garuda publication remains queued for retry.');
    return false;
  });
  // Keep the function alive after the signed order response has been returned.
  waitUntil(work);
  return work;
} });
export const config = { api: { bodyParser: false } };
export default handle(app);
