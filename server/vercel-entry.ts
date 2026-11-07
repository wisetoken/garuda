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
// Use Vercel's native Web handler. Node helpers consume the incoming body
// before a Node listener runs, which leaves Hono waiting on an exhausted stream.
export default { fetch: app.fetch };
