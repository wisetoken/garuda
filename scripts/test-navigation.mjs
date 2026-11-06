import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { navigation, resolveAppRoute, screenHref } from '../src/navigation.ts';
import { appRoutes } from './homepage-plugin.ts';
import { tradeDestination } from '../src/lib/market/workflow.ts';

test('every main page has a canonical path independent of screen query parameters', () => {
  for (const {screen, path} of navigation) {
    assert.equal(screenHref(screen), path);
    assert.deepEqual(resolveAppRoute(path), {screen, href:path});
    assert.deepEqual(resolveAppRoute(`${path}/`, '?screen=ignored'), {screen, href:path});
  }
  assert.equal(resolveAppRoute('/'), null);
  assert.equal(resolveAppRoute('/missing'), null);
});

test('old bookmarks retain their filters, stake identity and anchors when redirected', () => {
  assert.deepEqual(resolveAppRoute('/garuda/', '?screen=trade&collection=advanced&view=market&book=bids&source=catalog'),
    {screen:'trade', href:'/market?collection=advanced&book=bids&source=catalog'});
  assert.deepEqual(resolveAppRoute('/garuda', '?screen=trade&view=positions&collection=signature'),
    {screen:'stakes', href:'/stakes?collection=signature'});
  assert.deepEqual(resolveAppRoute('/garuda/index.html', '?screen=lend&collection=signature&tokenId=53'),
    {screen:'lend', href:'/lend?collection=signature&tokenId=53'});
  assert.deepEqual(resolveAppRoute('/garuda/', '?screen=privacy', '#private-reads'),
    {screen:'privacy', href:'/crops#private-reads'});
  assert.deepEqual(resolveAppRoute('/garuda/'), {screen:'trade', href:'/market'});
  assert.deepEqual(resolveAppRoute('/market', '?view=activity&book=bids'),
    {screen:'trade', href:'/market?view=activity&book=bids'});
});

test('wallet deployment remains a development-only route', () => {
  assert.equal(resolveAppRoute('/deploy'), null);
  assert.deepEqual(resolveAppRoute('/deploy', '', '', true), {screen:'deploy', href:'/deploy'});
  assert.deepEqual(resolveAppRoute('/garuda/', '?screen=deploy', '', true), {screen:'deploy', href:'/deploy'});
  assert.equal(resolveAppRoute('/garuda/', '?screen=deploy').screen, 'trade');
});

test('post-publication destinations and bid alerts use valid query delimiters', () => {
  assert.equal(screenHref('trade', {book:'bids'}), '/market?book=bids');
  assert.equal(tradeDestination({kind:'list'}, 'signature'), '/market?collection=signature');
  assert.equal(tradeDestination({kind:'bid'}, 'advanced'), '/market?collection=advanced&book=bids');
  assert.equal(tradeDestination({kind:'fill', row:{order:{kind:1}}}, 'signature'), '/market?collection=signature&book=bids');
});

test('dev and preview rewrite deep links without intercepting the homepage, assets or API', () => {
  const route = appRoutes();
  for (const url of ['/market', '/stakes/', '/market?book=bids', '/garuda/?screen=stakes']) {
    const req={url}; let next=false;
    route(req, {}, () => {next=true;});
    assert.equal(req.url, `/garuda/index.html${new URL(url, 'http://localhost').search}`);
    assert.equal(next, true);
  }
  for (const url of ['/', '/index.html', '/assets/app.js', '/api/garuda/sales', '/_astro/page.css', '/deploy']) {
    const req={url}; route(req, {}, () => {}); assert.equal(req.url, url);
  }
  const req={url:'/deploy'}; appRoutes(true)(req, {}, () => {}); assert.equal(req.url, '/garuda/index.html');
});

test('Vercel serves every app path and leaves the root homepage in place', async () => {
  const config=JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.redirects?.some(rule => rule.source === '/'), undefined);
  assert.equal(config.rewrites.some(rule => rule.source === '/'), false);
  for (const {path} of navigation) {
    assert.equal(config.rewrites.find(rule => rule.source === path)?.destination, '/garuda/index.html');
  }
  assert.equal(config.trailingSlash, false);
});
