import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {samplePdf} from './helpers/pdf.js';
import {readDocument} from '../extension/sources.js';

const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
const next = () => new Promise(setImmediate);
const candidate = {paperId: 42, slug: 'Huang2024_Segment', title: 'Segment and Caption Anything', authors: 'Xiaoke Huang', arxivId: null, year: '2024'};
const collection = {id: '3', name: 'Vision', writable: true};

async function popup(sendMessage, {url = "https://openaccess.thecvf.com/content/CVPR2024/html/example.html", pageHtml = '<div id="papertitle">Segment and Caption Anything</div>', fetchFn} = {}) {
  const {document, window} = parseHTML(html);
  const page = parseHTML(pageHtml).document;
  const saved = Object.fromEntries(['document', 'location', 'chrome', 'fetch'].map(k => [k, globalThis[k]]));
  Object.assign(globalThis, {document, location: {search: ''}, chrome: {
    runtime: {id: 'test', sendMessage},
    tabs: {query: async () => [{id: 1, url}]},
    scripting: {executeScript: async ({func}) => { assert.equal(func.name, readDocument.name); return [{result: func(page)}]; }}
  }});
  if (fetchFn) globalThis.fetch = fetchFn;
  await import(`../extension/popup.js?test=${Math.random()}`); await next();
  return {document, click: id => document.getElementById(id).click(), input: (id, value) => {
    const element = document.getElementById(id); element.value = value; element.dispatchEvent(new window.Event('input'));
  }, restore: () => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } }};
}

test('popup completes CVF detection, deliberate candidate selection, collection choice and confirmed save', async () => {
  const messages = [];
  const env = await popup(async message => {
    messages.push(message);
    const data = message.type === 'resolve' ? {candidates: [candidate], collections: [collection]}
      : message.type === 'choose' ? {paper: {...candidate, collectionIds: []}}
      : {state: 'saved', collectionName: 'Vision'};
    return {ok: true, data};
  });
  try {
    const {document} = env;
    assert.equal(messages[0].metadata.title, candidate.title);
    assert.equal(document.getElementById('candidates').hidden, false);
    assert.equal(document.getElementById('paper').hidden, true);
    document.querySelector('.candidate button').click(); await next();
    assert.equal(document.getElementById('match-label').textContent, '✓ Selected by you');
    assert.equal(document.getElementById('paper-title').textContent, candidate.title);
    const radio = document.querySelector('input[type="radio"]'); radio.dispatchEvent(new document.defaultView.Event('change'));
    env.click('save'); await next();
    assert.equal(messages.at(-1).selection.title, candidate.title);
    assert.match(document.getElementById('result').textContent, /Saved to Vision. Confirmed/);
    assert.equal(document.querySelector('input[type="radio"]').disabled, true);
  } finally { env.restore(); }
});

test('editing while a lookup is pending prevents stale results from replacing the title', async () => {
  let resolve;
  const env = await popup(() => new Promise(done => { resolve = done; }));
  try {
    // The title editor stays available for correction if metadata lookup fails.
    env.document.getElementById('manual').hidden = false;
    env.input('manual-title', 'A Different Paper');
    resolve({ok: true, data: {paper: {...candidate, collectionIds: []}, collections: [collection], match: 'exact'}});
    await next();
    assert.equal(env.document.getElementById('paper').hidden, true);
    assert.equal(env.document.getElementById('manual-title').value, 'A Different Paper');
    assert.equal(env.document.getElementById('search').disabled, false);
  } finally { env.restore(); }
});

test('shows available metadata immediately, keeping unverified collections and links hidden', async () => {
  let release;
  const env = await popup(() => new Promise(resolve => { release = resolve; }));
  try {
    assert.equal(env.document.getElementById('paper').hidden, false);
    assert.equal(env.document.getElementById('paper-title').textContent, candidate.title);
    assert.equal(env.document.getElementById('collection-picker').hidden, true);
    assert.equal(env.document.getElementById('scholar-link').hidden, true);
    assert.equal(env.document.getElementById('edit-title').hidden, false);
    release({ok: true, data: {paper: {...candidate, collectionIds: []}, collections: [collection], match: 'title'}});
    await next(); assert.equal(env.document.getElementById('collection-picker').hidden, false);
  } finally { env.restore(); }
});

test('arXiv pages use the open tab metadata without a redundant abstract download', async () => {
  const messages = [];
  const env = await popup(async message => {
    messages.push(message);
    return {ok: true, data: {paper: {...candidate, collectionIds: []}, collections: [collection], match: 'exact'}};
  }, {url: 'https://arxiv.org/abs/2401.01234v2', pageHtml: '<meta name="citation_title" content="A Useful Paper">'});
  try {
    assert.deepEqual(messages.map(m => m.type), ['resolve']);
    assert.equal(messages[0].metadata.arxivId, '2401.01234');
    env.click('retry'); await next(); assert.equal(messages.at(-1).refresh, true);
  } finally { env.restore(); }
});

test('search failure retains manual title and PDF fallback', async () => {
  const env = await popup(async () => ({ok: false, error: 'Sign in and retry.'}));
  try {
    assert.equal(env.document.getElementById('manual').hidden, false);
    assert.equal(env.document.getElementById('pdf-tools').hidden, false);
    assert.match(env.document.getElementById('status').textContent, /Sign in/);
  } finally { env.restore(); }
});

async function until(check) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Popup did not reach the expected state');
}

test('a PDF title automatically triggers search and shows the matched collection picker', async () => {
  const messages = [];
  const env = await popup(async message => {
    messages.push(message);
    return {ok: true, data: {paper: {...candidate, title: message.metadata.title, collectionIds: []}, collections: [collection], match: 'title'}};
  }, {url: 'https://example.org/paper.pdf', pageHtml: '', fetchFn: async () => new Response(samplePdf())});
  try {
    await until(() => !env.document.getElementById('paper').hidden);
    assert.equal(messages.length, 1); assert.equal(messages[0].type, 'resolve');
    assert.equal(messages[0].metadata.title, 'A Useful Paper About Learning');
    assert.equal(env.document.getElementById('match-label').textContent, '✓ Title match');
    assert.equal(env.document.getElementById('manual').hidden, true);
    assert.equal(env.document.getElementById('pdf-tools').hidden, true);
  } finally { env.restore(); }
});

test('an unreadable PDF title keeps manual entry without submitting an empty search', async () => {
  const messages = [];
  const env = await popup(async message => { messages.push(message); }, {
    url: 'https://example.org/paper.pdf', pageHtml: '', fetchFn: async () => new Response(samplePdf({withTitle: false, text: ''}))
  });
  try {
    await until(() => !env.document.getElementById('manual').hidden);
    assert.equal(messages.length, 0);
    assert.match(env.document.getElementById('status').textContent, /no readable title/);
  } finally { env.restore(); }
});

test('an old background worker produces reload instructions instead of irrelevant PDF controls', async () => {
  const env = await popup(async () => ({ok: false, error: 'Unknown request.'}));
  try {
    assert.match(env.document.getElementById('status').textContent, /chrome:\/\/extensions/);
    for (const id of ['manual', 'pdf-tools', 'retry']) assert.equal(env.document.getElementById(id).hidden, true);
  } finally { env.restore(); }
});

test('OpenReview PDF uses the existing session when its forum page cannot supply a title', async () => {
  const downloads = [], messages = [];
  const env = await popup(async message => {
    messages.push(message);
    return {ok: true, data: {paper: {...candidate, title: message.metadata.title, collectionIds: []}, collections: [collection], match: 'title'}};
  }, {url: 'https://openreview.net/pdf?id=4vGVQVz5KG', pageHtml: '', fetchFn: async (url, options) => {
    downloads.push(url);
    assert.equal(options.credentials, 'include'); assert.equal(options.redirect, 'error');
    return url.includes('/forum?') ? new Response('Verification required', {status: 403}) : new Response(samplePdf());
  }});
  try {
    await until(() => !env.document.getElementById('paper').hidden);
    assert.deepEqual(downloads, ['https://openreview.net/forum?id=4vGVQVz5KG', 'https://openreview.net/pdf?id=4vGVQVz5KG']);
    assert.equal(messages.length, 1); assert.equal(messages[0].metadata.title, 'A Useful Paper About Learning');
    assert.equal(env.document.getElementById('source-page').hidden, true);
  } finally { env.restore(); }
});

test('persistent OpenReview verification offers the exact forum link and does not search', async () => {
  let queries = 0;
  const env = await popup(async () => { queries++; }, {
    url: 'https://openreview.net/pdf?id=4vGVQVz5KG', pageHtml: '', fetchFn: async () => new Response('Verification required', {status: 403})
  });
  try {
    await until(() => !env.document.getElementById('source-page').hidden);
    assert.equal(env.document.getElementById('source-page').href, 'https://openreview.net/forum?id=4vGVQVz5KG');
    assert.equal(queries, 0); assert.equal(env.document.getElementById('manual').hidden, false);
  } finally { env.restore(); }
});
