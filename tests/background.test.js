import test from 'node:test';
import assert from 'node:assert/strict';
import {API} from '../extension/core.js';

test('background accepts the popup resolve and choose routes and rejects other senders', async () => {
  const original = {chrome: globalThis.chrome, fetch: globalThis.fetch};
  let listener;
  const sender = {id: 'test', url: 'chrome-extension://test/popup.html'};
  const paper = {paper_id: 42, title: 'A Useful Paper', authors: 'Example Author', cache_file_name: 'Example_Paper.pdf', user_paper_collections: []};
  globalThis.chrome = {runtime: {id: 'test', getURL: path => `chrome-extension://test/${path}`, onMessage: {addListener: fn => { listener = fn; }}}};
  globalThis.fetch = async url => {
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
    assert.equal(listener({type: 'resolve'}, {id: 'other', url: sender.url}, () => assert.fail('Unexpected reply')), false);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
