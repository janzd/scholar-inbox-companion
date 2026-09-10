import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const script = await readFile(new URL('../extension/theme.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
function popup({storage = new Map(), dark = false, broken = false} = {}) {
  const events = {}, windowEvents = {}, controlEvents = {}, paletteEvents = {};
  const root = {dataset: {}};
  let ready = false, changed;
  const inputs = ['light', 'dark', 'system'].map(value => ({value, checked: false}));
  const control = {get value() { return inputs.find(input => input.checked)?.value; },
    querySelectorAll: () => inputs, addEventListener: (type, fn) => controlEvents[type] = fn};
  const paletteInputs = ['blue', 'scholar'].map(value => ({value, checked: false}));
  const paletteControl = {get value() { return paletteInputs.find(input => input.checked)?.value; },
    querySelectorAll: () => paletteInputs, addEventListener: (type, fn) => paletteEvents[type] = fn};
  const feedback = {hidden: true};
  const media = {matches: dark, addEventListener: (_, fn) => changed = fn};
  runInNewContext(script, {
    window: {matchMedia: () => media, addEventListener: (type, fn) => windowEvents[type] = fn},
    document: {documentElement: root, getElementById: id => ready ? ({theme:control, palette:paletteControl, 'theme-feedback':feedback}[id] || null) : null,
      addEventListener: (type, fn) => events[type] = fn},
    localStorage: {getItem: key => { if (broken) throw Error('Blocked'); return storage.get(key); },
      setItem: (key, value) => { if (broken) throw Error('Blocked'); storage.set(key, value); }}
  });
  return {root, control, paletteControl, feedback, ready: () => { ready = true; events.DOMContentLoaded(); },
    choose: value => { controlEvents.change({target: {value}}); },
    choosePalette: value => { paletteEvents.change({target: {value}}); },
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

test('every palette and mode keeps text and focus indicators readable on their backgrounds', async () => {
  const css = await readFile(new URL('../extension/theme.css', import.meta.url), 'utf8');
  const luminance = hex => hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
  const blocks = css.split('}').filter(block => block.includes('--page:'));
  assert.equal(blocks.length, 4);
  for (const block of blocks) {
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

test('palette and mode persist independently without changing existing users’ appearance', () => {
  const storage = new Map([['appearance', 'dark']]);
  const env = popup({storage});
  assert.equal(env.root.dataset.palette, 'blue');
  assert.equal(env.root.dataset.theme, 'dark');
  env.ready(); env.choosePalette('scholar');
  assert.equal(env.root.dataset.theme, 'dark');
  assert.equal(storage.get('appearance'), 'dark');
  const reopened = popup({storage});
  assert.equal(reopened.root.dataset.palette, 'scholar');
  assert.equal(reopened.root.dataset.theme, 'dark');
  env.choose('system'); env.system(true); env.system(false);
  assert.equal(env.root.dataset.palette, 'scholar');
  assert.equal(env.root.dataset.theme, 'light');
  assert.equal(storage.get('palette'), 'scholar');
  assert.equal(env.paletteControl.value, 'scholar');
});

test('palette updates propagate to other views, with invalid values falling back to Blue', () => {
  const env = popup({dark:true}); env.ready();
  env.external('palette', 'scholar');
  assert.equal(env.root.dataset.palette, 'scholar');
  assert.equal(env.control.value, 'system');
  assert.equal(env.root.dataset.theme, 'dark');
  env.external('appearance', 'light');
  assert.equal(env.root.dataset.palette, 'scholar');
  env.external('palette', 'invalid');
  assert.equal(env.root.dataset.palette, 'blue');
  assert.equal(env.root.dataset.theme, 'light');
  env.external(null, null);
  assert.equal(env.root.dataset.theme, 'dark');
  const invalid = popup({storage:new Map([['palette','invalid']])});
  assert.equal(invalid.root.dataset.palette,'blue');
  const blocked = popup({broken:true}); blocked.ready(); blocked.choosePalette('scholar');
  assert.equal(blocked.root.dataset.palette, 'scholar');
  assert.equal(blocked.feedback.hidden, false);
});

test('Options is a full-tab extension page and all views initialize shared appearance before styles', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.options_ui, {page:'options.html', open_in_tab:true});
  for (const page of ['options.html','popup.html','benchmark.html']) {
    const markup = await readFile(new URL('../extension/'+page, import.meta.url), 'utf8');
    assert.ok(markup.indexOf('<script src="theme.js"></script>') >= 0);
    assert.ok(markup.indexOf('<script src="theme.js"></script>') < markup.indexOf('<link rel="stylesheet"'));
  }
  assert.match(html, /href="options.html"/);
});
