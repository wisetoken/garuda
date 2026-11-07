import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import handler from '../server/vercel-entry.ts';
import { createApp } from '../server/app.ts';
import { marketFailureDetails } from '../server/market/diagnostics.ts';
import { SalesError } from '../src/lib/blend/sales.ts';

const deployment = JSON.parse(await readFile(new URL('./fixtures/signature-market.json', import.meta.url), 'utf8'));
const request = (path, body) => new Request(`https://garuda.test/api/garuda/${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(body)); controller.close();
  } }), duplex: 'half',
});

test('production entry uses a native Web handler and rejects streamed malformed JSON promptly', { timeout: 2000 }, async () => {
  // Vercel selects this branch by the fetch export, before Node request helpers.
  assert.equal(typeof handler, 'object');
  const response = await handler.fetch(request(`arkiv/0x${'ab'.repeat(32)}/extend`, '{invalid'));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid extension request.' });
});

test('native production handler retains the body-size limit', { timeout: 2000 }, async () => {
  const oversized = request('sales', 'x'.repeat(16385));
  oversized.headers.set('content-length', '16385');
  const response = await handler.fetch(oversized);
  assert.equal(response.status, 413);
});

test('the Web request path rejects invalid unsigned listings before publication', { timeout: 2000 }, async () => {
  let published = false;
  const service = { store: { deployment }, publish: async () => { published = true; } };
  const app = createApp({ resolvers: [async () => service, async () => null] });
  for (const body of ['{}', '{broken']) {
    const response = await app.fetch(request('sales', body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid signed order.' });
  }
  assert.equal(published, false);
});

test('backend diagnostics distinguish contention and upstream failures without logging secrets', () => {
  const busy = new SalesError('index-busy', 'private payload');
  assert.equal(marketFailureDetails(busy).causes[0].code, 'index-busy');
  const error = Object.assign(new Error('https://rpc.example/secret-key'), {
    cause: Object.assign(new Error('postgres://user:password@host/db'), { code: 'ETIMEDOUT', status: 503 }),
  });
  error.cause.cause = error;
  const details = marketFailureDetails(error);
  assert.equal(details.causes.length, 2);
  assert.equal(details.causes[1].code, 'ETIMEDOUT');
  assert.equal(details.causes[1].status, 503);
  assert.doesNotMatch(JSON.stringify(details), /secret|password|payload|rpc.example/);
});
