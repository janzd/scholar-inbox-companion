import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readDocument} from '../extension/sources.js';

const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
const next = () => new Promise(setImmediate);
const candidate = {paperId: 42, slug: 'Huang2024_Segment', title: 'Segment and Caption Anything', authors: 'Xiaoke Huang', arxivId: null, year: '2024'};
const collection = {id: '3', name: 'Vision', writable: true};

async function popup(sendMessage) {
  const {document, window} = parseHTML(html);
  const page = parseHTML('<div id="papertitle">Segment and Caption Anything</div>').document;
  const saved = Object.fromEntries(['document', 'location', 'chrome'].map(k => [k, globalThis[k]]));
  Object.assign(globalThis, {document, location: {search: ''}, chrome: {
    runtime: {id: 'test', sendMessage},
    tabs: {query: async () => [{id: 1, url: 'https://openaccess.thecvf.com/content/CVPR2024/html/example.html'}]},
    scripting: {executeScript: async ({func}) => { assert.equal(func.name, readDocument.name); return [{result: func(page)}]; }}
  }});
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

test('search failure retains manual title and PDF fallback', async () => {
  const env = await popup(async () => ({ok: false, error: 'Sign in and retry.'}));
  try {
    assert.equal(env.document.getElementById('manual').hidden, false);
    assert.equal(env.document.getElementById('pdf-tools').hidden, false);
    assert.match(env.document.getElementById('status').textContent, /Sign in/);
  } finally { env.restore(); }
});
