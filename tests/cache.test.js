import test from 'node:test';
import assert from 'node:assert/strict';
import {LookupCache} from '../extension/cache.js';
import {ScholarClient, API} from '../extension/core.js';

function store() {
  let data = {};
  return {get: async () => structuredClone(data), set: async value => { data = structuredClone(value); }};
}
const metadata = {title: 'A Useful Paper', arxivId: '2401.01234'};
function fixture({cache = new LookupCache()} = {}) {
  const state = {account: 'A', loggedIn: true, membership: [], permission: 'owner', detailStatus: 200, id: 42, title: metadata.title};
  const calls = [];
  const fetch = async (url, options) => {
    const path = url.slice(API.length); calls.push(path);
    const paper = {paper_id: state.id, arxiv_id: metadata.arxivId, title: state.title, authors: 'Example Author', cache_file_name: 'Example.pdf', user_paper_collections: state.membership};
    if (path.startsWith('/papers/') && state.detailStatus !== 200) return new Response('{}', {status: state.detailStatus});
    const data = path === '/session_info' ? {is_logged_in: state.loggedIn}
      : path === '/search' ? {digest_df: [paper]}
      : path === '/get_all_user_collections' ? {collections: [{id: state.account, name: `Account ${state.account}`, permission: state.permission}]}
      : path === '/add_paper_to_collection/' ? (state.membership = [{id: JSON.parse(options.body).collection_id}], {success: true})
      : {is_authenticated: state.loggedIn, paper};
    return new Response(JSON.stringify(data));
  };
  return {state, calls, fetch, client: new ScholarClient(fetch, {cache})};
}

test('repeat opens and worker restarts reuse only the record mapping; account data stays fresh', async () => {
  const storage = store();
  const env = fixture({cache: new LookupCache({storage})});
  const first = await env.client.resolve(metadata); assert.equal(first.cacheHit, false);
  env.calls.length = 0; env.state.account = 'B'; env.state.permission = 'viewer'; env.state.membership = [{id: 'B'}];
  const restarted = new ScholarClient(env.fetch, {cache: new LookupCache({storage})});
  const repeat = await restarted.resolve(metadata);
  assert.equal(repeat.cacheHit, true); assert.equal(env.calls.includes('/search'), false);
  assert.deepEqual(new Set(env.calls), new Set(['/session_info', '/get_all_user_collections', '/papers/Example']));
  assert.equal(repeat.collections[0].id, 'B'); assert.equal(repeat.collections[0].writable, false);
  assert.deepEqual(repeat.paper.collectionIds, ['B']);
  const persisted = JSON.stringify(await storage.get());
  for (const field of ['Account A', 'Account B', 'collectionIds', 'membership', 'permission', 'authors', 'A Useful Paper']) assert.equal(persisted.includes(field), false, field);
});

test('sign-out cannot reveal a cached picker and clears the lookup cache', async () => {
  const cache = new LookupCache(); const env = fixture({cache});
  await env.client.resolve(metadata); env.state.loggedIn = false;
  await assert.rejects(env.client.resolve(metadata), /Sign in|session/);
  assert.equal(cache.entries.size, 0);
  env.state.loggedIn = true; env.calls.length = 0;
  assert.equal((await env.client.resolve(metadata)).cacheHit, false);
  assert.ok(env.calls.includes('/search'));
});

test('expiry and explicit refresh redo search, but failures are not cached', async () => {
  let now = 100;
  const env = fixture({cache: new LookupCache({now: () => now, ttl: 50})});
  await env.client.resolve(metadata); now = 151; env.calls.length = 0;
  assert.equal((await env.client.resolve(metadata)).cacheHit, false);
  env.calls.length = 0; await env.client.resolve(metadata, {refresh: true}); assert.ok(env.calls.includes('/search'));
  env.state.detailStatus = 503; env.calls.length = 0;
  await assert.rejects(env.client.resolve(metadata), /503/);
  assert.equal(env.calls.filter(p => p.startsWith('/papers/')).length, 1);
  assert.equal(env.calls.includes('/search'), false, 'no retry on service failure');
});

test('a replaced cached record re-resolves once and still validates current identity', async () => {
  const env = fixture(); await env.client.resolve(metadata);
  env.state.id = 43; env.calls.length = 0;
  const result = await env.client.resolve(metadata);
  assert.equal(result.paper.paperId, 43); assert.equal(result.cacheHit, false);
  assert.equal(env.calls.filter(p => p === '/search').length, 1);
});

test('cached lookup never authorizes a save with revoked collection permissions', async () => {
  const env = fixture(); const {paper} = await env.client.resolve(metadata);
  assert.equal((await env.client.resolve(metadata)).cacheHit, true);
  env.state.permission = 'viewer';
  await assert.rejects(env.client.save({...paper, collectionId: 'A'}), /read-only/);
  assert.equal(env.calls.includes('/add_paper_to_collection/'), false);
});

test('bounded session cache survives storage failures without failing lookups', async () => {
  const cache = new LookupCache({storage: {get: async () => { throw Error('unavailable'); }, set: async () => { throw Error('quota'); }}, limit: 2});
  await cache.set('a', 1); await cache.set('b', 2); await cache.set('c', 3);
  assert.equal(await cache.get('a'), null); assert.equal(await cache.get('c'), 3);
  const env = fixture({cache}); assert.ok((await env.client.resolve(metadata)).paper);
});

test('sign-in, collection loading, and search overlap without showing results before sign-in completes', async () => {
  const env = fixture(); const starts = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const client = new ScholarClient(async (url, options) => {
    starts.push(url.slice(API.length));
    if (url.endsWith('/session_info')) await gate;
    return env.fetch(url, options);
  });
  let finished = false;
  const task = client.resolve(metadata).then(result => { finished = true; return result; });
  for (let i = 0; i < 20 && !starts.includes('/papers/Example'); i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.ok(starts.includes('/get_all_user_collections')); assert.ok(starts.includes('/search'));
  assert.equal(finished, false);
  release(); assert.ok((await task).paper);
});

test('diagnostic baseline restores sign-in-first sequencing and bypasses cache hits', async () => {
  const env = fixture(); await env.client.resolve(metadata);
  const calls = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  env.client.fetch = async (url, options) => {
    calls.push(url.slice(API.length));
    if (url.endsWith('/session_info')) await gate;
    return env.fetch(url, options);
  };
  const pending = env.client.resolve(metadata, {parallel: false, refresh: true});
  await new Promise(setImmediate); assert.deepEqual(calls, ['/session_info']);
  release(); assert.equal((await pending).cacheHit, false); assert.ok(calls.includes('/search'));
});
