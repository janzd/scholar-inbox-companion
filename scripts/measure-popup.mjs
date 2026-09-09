// Controlled DOM benchmark, NOT an installed-Chrome or live-network benchmark.
// Uses the real before/after popup + client modules with identical simulated I/O.
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {parseHTML, DOMParser} from 'linkedom';
const root = fileURLToPath(new URL('../', import.meta.url));
const baselineRevision = '74f81fc';
const baseline = await mkdtemp(join(tmpdir(), 'scholar-popup-baseline-'));
const delays = {source: 12, session: 305, search: 491, detail: 538, collections: 305, tab: 3, injection: 3, message: 2};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const rows = [];
const original = Object.fromEntries(['document', 'location', 'chrome', 'DOMParser'].map(k => [k, globalThis[k]]));
try {
  await writeFile(join(baseline, 'package.json'), '{"type":"module"}');
  for (const file of ['popup.js', 'popup.html', 'core.js', 'sources.js', 'pdf.js']) {
    await writeFile(join(baseline, file), execFileSync('git', ['show', `${baselineRevision}:extension/${file}`], {cwd: root}));
  }
  const versions = {before: baseline, after: join(root, 'extension')};
  const clientModules = {};
  for (const [mode, directory] of Object.entries(versions)) clientModules[mode] = await import(pathToFileURL(join(directory, 'core.js')));
  for (let round = 1; round <= 3; round++) {
    for (const mode of round % 2 ? ['before', 'after'] : ['after', 'before']) {
      const {ScholarClient, API} = clientModules[mode];
      let requests;
      const sourceHtml = '<meta name="citation_title" content="A Useful Paper"><meta name="citation_author" content="Example Author">';
      const client = new ScholarClient(async url => {
        const path = url.startsWith(API) ? url.slice(API.length) : 'source';
        requests.push(path);
        const stage = path === 'source' ? 'source' : path === '/session_info' ? 'session' : path === '/search' ? 'search' : path.startsWith('/papers/') ? 'detail' : 'collections';
        await delay(delays[stage]);
        if (stage === 'source') return new Response(sourceHtml);
        const paper = {paper_id: 42, arxiv_id: '2401.01234', title: 'A Useful Paper', authors: 'Example Author', cache_file_name: 'Example.pdf', user_paper_collections: []};
        const data = stage === 'session' ? {is_logged_in: true} : stage === 'search' ? {digest_df: [paper]}
          : stage === 'detail' ? {is_authenticated: true, paper} : {collections: [{id: '1', name: 'Example collection', permission: 'owner'}]};
        return new Response(JSON.stringify(data));
      });
      for (const open of ['first', 'repeat']) {
        requests = []; const started = performance.now();
        const {document} = parseHTML(await readFile(join(versions[mode], 'popup.html'), 'utf8'));
        Object.assign(globalThis, {document, DOMParser, location: {search: ''}, chrome: {
          tabs: {query: async () => { await delay(delays.tab); return [{id: 1, url: 'https://arxiv.org/abs/2401.01234'}]; }},
          scripting: {executeScript: async ({func}) => { await delay(delays.injection); return [{result: func(parseHTML(sourceHtml).document)}]; }},
          runtime: {id: 'benchmark', sendMessage: async message => {
            await delay(delays.message);
            try {
              const data = message.type === 'metadata' ? {html: await client.arxivPage(message.arxivId)} : await client.resolve(message.metadata, {refresh: message.refresh});
              return {ok: true, data};
            } catch (error) { return {ok: false, error: error.message}; }
          }}
        }});
        await import(pathToFileURL(join(versions[mode], 'popup.js')).href + `?run=${round}-${open}`);
        let metadataMs = null;
        while (performance.now() - started < 10000) {
          const shown = !document.getElementById('paper').hidden;
          if (shown && metadataMs === null) metadataMs = Math.round(performance.now() - started);
          const picker = document.getElementById('collection-picker');
          if (shown && (!picker || !picker.hidden) && document.querySelector('#collections input')) break;
          if (document.getElementById('status').classList.contains('error')) throw Error(document.getElementById('status').textContent);
          await delay(1);
        }
        if (!document.querySelector('#collections input')) throw Error('Popup never became usable');
        rows.push({round, mode, open, metadataMs, usableMs: Math.round(performance.now() - started), requests: [...requests]});
      }
    }
  }
  console.log(JSON.stringify({method: 'Real popup/client modules in linkedom; simulated I/O; excludes Chrome startup and painting; not a live latency claim', baselineRevision, delaysMs: delays, rows}, null, 2));
} finally {
  for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  await rm(baseline, {recursive: true, force: true});
}
