import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const script = await readFile(new URL('../extension/theme.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
function popup({storage = new Map(), dark = false, broken = false} = {}) {
  const events = {}, windowEvents = {}, controlEvents = {};
  const root = {dataset: {}};
  let ready = false, changed;
  const control = {value: '', addEventListener: (type, fn) => controlEvents[type] = fn};
  const feedback = {hidden: true};
  const media = {matches: dark, addEventListener: (_, fn) => changed = fn};
  runInNewContext(script, {
    window: {matchMedia: () => media, addEventListener: (type, fn) => windowEvents[type] = fn},
    document: {documentElement: root, getElementById: id => ready ? (id === 'theme' ? control : feedback) : null,
      addEventListener: (type, fn) => events[type] = fn},
    localStorage: {getItem: key => { if (broken) throw Error('Blocked'); return storage.get(key); },
      setItem: (key, value) => { if (broken) throw Error('Blocked'); storage.set(key, value); }}
  });
  return {root, control, feedback, ready: () => { ready = true; events.DOMContentLoaded(); },
    choose: value => { control.value = value; controlEvents.change({target: control}); },
    system: value => { media.matches = value; changed(); },
    external: (key, newValue) => windowEvents.storage({key, newValue})};
}

test('system default and saved overrides apply synchronously before the body exists', () => {
  for (const dark of [true, false]) {
    const env = popup({dark});
    assert.equal(env.root.dataset.theme, dark ? 'dark' : 'light');
    env.ready(); assert.equal(env.control.value, 'system');
    for (const saved of ['light', 'dark']) {
      const override = popup({dark, storage: new Map([['appearance', saved]])});
      assert.equal(override.root.dataset.theme, saved);
      override.ready(); assert.equal(override.control.value, saved);
    }
  }
  assert.ok(html.indexOf('<script src="theme.js"></script>') < html.indexOf('<link rel="stylesheet"'));
});

test('selection persists across fresh popup contexts and only System follows appearance changes', () => {
  const storage = new Map(), env = popup({storage}); env.ready();
  env.choose('dark'); env.system(false);
  assert.equal(env.root.dataset.theme, 'dark');
  assert.equal(popup({storage}).root.dataset.theme, 'dark');
  env.choose('light'); env.system(true);
  assert.equal(env.root.dataset.theme, 'light');
  env.choose('system');
  assert.equal(env.root.dataset.theme, 'dark');
  env.system(false); assert.equal(env.root.dataset.theme, 'light');
  assert.equal(storage.get('appearance'), 'system');
});

test('invalid preferences and blocked storage retain a working theme control', () => {
  const invalid = popup({dark: true, storage: new Map([['appearance', 'unexpected']])});
  assert.equal(invalid.root.dataset.theme, 'dark');
  const blocked = popup({broken: true}); blocked.ready(); blocked.choose('dark');
  assert.equal(blocked.root.dataset.theme, 'dark');
  assert.equal(blocked.feedback.hidden, false);
  assert.match(blocked.feedback.textContent, /could not be saved/);
});

test('other extension pages pick up changes or removal of the saved preference', () => {
  const env = popup(); env.ready();
  env.external('unrelated', 'dark'); assert.equal(env.root.dataset.theme, 'light');
  env.external('appearance', 'dark'); assert.equal(env.root.dataset.theme, 'dark');
  assert.equal(env.control.value, 'dark');
  env.external(null, null); assert.equal(env.root.dataset.theme, 'light');
  assert.equal(env.control.value, 'system');
});

test('both palettes keep text and focus indicators readable on their backgrounds', async () => {
  const css = await readFile(new URL('../extension/theme.css', import.meta.url), 'utf8');
  const luminance = hex => hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
  for (const block of css.split('}').slice(0, 2)) {
    const colors = Object.fromEntries([...block.matchAll(/--([\w-]+): #(\w{6})/g)].map(m => [m[1], luminance(m[2])]));
    const check = (fg, bg, minimum) => {
      const ratio = (Math.max(colors[fg], colors[bg]) + .05) / (Math.min(colors[fg], colors[bg]) + .05);
      assert.ok(ratio >= minimum, `${fg} on ${bg}: ${ratio.toFixed(2)} (minimum ${minimum})`);
    };
    for (const fg of ['text', 'muted', 'link']) for (const bg of ['page', 'surface', 'selected']) check(fg, bg, 4.5);
    for (const bg of ['primary', 'primary-hover']) check('primary-text', bg, 4.5);
    for (const bg of ['positive', 'warning', 'error', 'disabled', 'brand']) check(`${bg}-text`, bg, 4.5);
    for (const bg of ['page', 'surface', 'selected']) check('focus', bg, 3);
  }
});
