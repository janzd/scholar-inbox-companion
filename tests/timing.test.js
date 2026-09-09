import test from 'node:test';
import assert from 'node:assert/strict';

test('popup timing waits for painting and stores only bounded, non-identifying diagnostics', async () => {
  const original = {chrome: globalThis.chrome, requestAnimationFrame: globalThis.requestAnimationFrame};
  const frames = []; let saved;
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  globalThis.chrome = {runtime: {getManifest: () => ({version: '0.3.0'})}, storage: {session: {
    get: async () => ({popupTimingsV1: Array.from({length: 20}, () => ({state: 'old'}))}),
    set: async data => { saved = data; }
  }}};
  try {
    const timing = await import('../extension/timing.js?test=privacy');
    timing.metadataReady(); timing.popupReady({state: 'paper', source: 'private.example.org', cacheHit: true});
    assert.equal(saved, undefined);
    frames.shift()(); assert.equal(saved, undefined);
    await frames.shift()();
    assert.equal(saved.popupTimingsV1.length, 20);
    const last = saved.popupTimingsV1.at(-1);
    assert.deepEqual(Object.keys(last).sort(), ['at', 'cacheHit', 'metadataMs', 'mode', 'source', 'state', 'usableMs', 'version']);
    assert.equal(last.source, 'Other'); assert.equal(last.cacheHit, true); assert.equal(last.mode, 'optimized');
    assert.ok(last.usableMs >= last.metadataMs);
    timing.popupReady({state: 'paper', source: 'PDF'}); assert.equal(frames.length, 0);
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
