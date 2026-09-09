import test from 'node:test';
import assert from 'node:assert/strict';
import {API} from '../extension/core.js';

test('background accepts the popup resolve and choose routes and rejects other senders', async () => {
  const original = {chrome: globalThis.chrome, fetch: globalThis.fetch};
  let listener; const storage = {};
  const sender = {id: 'test', url: 'chrome-extension://test/popup.html'};
  const paper = {paper_id: 42, title: 'A Useful Paper', authors: 'Example Author', cache_file_name: 'Example_Paper.pdf', user_paper_collections: []};
  globalThis.chrome = {storage: {session: {get: async () => storage, set: async data => Object.assign(storage, data)}}, runtime: {id: 'test', getURL: path => `chrome-extension://test/${path}`, onMessage: {addListener: fn => { listener = fn; }}}};
  const pageDownloads = [];
  globalThis.fetch = async (url, options) => {
    if (!url.startsWith(API)) {
      pageDownloads.push({url, options});
      return new Response('<meta name="citation_title" content="A Useful Paper">');
    }
    const path = url.slice(API.length);
    const data = path === '/session_info' ? {is_logged_in: true}
      : path === '/search' ? {digest_df: [paper]}
      : path === '/get_all_user_collections' ? {collections: []}
      : {is_authenticated: true, paper};
    return new Response(JSON.stringify(data));
  };
  try {
    await import('../extension/background.js');
    const send = message => new Promise(resolve => assert.equal(listener(message, sender, resolve), true));
    const result = await send({type: 'resolve', metadata: {title: paper.title}});
    assert.equal(result.ok, true); assert.equal(result.data.match, 'title');
    assert.equal(result.data.paper.paperId, 42);
    const chosen = await send({type: 'choose', candidate: result.data.paper});
    assert.equal(chosen.ok, true); assert.equal(chosen.data.paper.paperId, 42);
    const landing = await send({type: 'landingPage', url: 'https://openreview.net/pdf?id=4vGVQVz5KG'});
    assert.equal(landing.ok, true); assert.match(landing.data.html, /citation_title/);
    assert.equal(pageDownloads[0].url, 'https://openreview.net/forum?id=4vGVQVz5KG');
    assert.equal(pageDownloads[0].options.credentials, 'include');
    assert.equal(pageDownloads[0].options.redirect, 'error');
    const cvf = await send({type: 'landingPage', url: 'https://openaccess.thecvf.com/content/CVPR2024/papers/Example.pdf'});
    assert.equal(cvf.ok, true);
    assert.equal(pageDownloads[1].url, 'https://openaccess.thecvf.com/content/CVPR2024/html/Example.html');
    assert.equal(pageDownloads[1].options.credentials, 'omit');
    assert.equal((await send({type: 'landingPage', url: 'https://openreview.net/forum?id=abc&noteId=review'})).ok, true);
    assert.equal(pageDownloads[2].url, 'https://openreview.net/forum?id=abc');
    for (const url of ['https://example.org/paper.pdf', 'https://openreview.net.evil.test/pdf?id=abc', 'https://openreview.net/settings', 'file:///paper.pdf']) {
      assert.equal((await send({type: 'landingPage', url})).ok, false);
    }
    assert.equal(pageDownloads.length, 3, 'Unsupported URLs must not be fetched');
    assert.equal(listener({type: 'resolve'}, {id: 'other', url: sender.url}, () => assert.fail('Unexpected reply')), false);
    const diagnosticSender = {id: 'test', url: 'chrome-extension://test/benchmark.html'};
    assert.equal(listener({type: 'save'}, diagnosticSender, () => assert.fail('Timing page must not save')), false);
    assert.equal(listener({type: 'landingPage'}, diagnosticSender, () => assert.fail('Timing page must not fetch pages')), false);
    const configured = await new Promise(resolve => listener({type: 'benchmarkMode', mode: 'baseline'}, diagnosticSender, resolve));
    assert.equal(configured.ok, true); assert.equal(storage.popupBenchmarkMode, 'baseline');
    assert.deepEqual(storage.lookupCacheV1, []);

  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
