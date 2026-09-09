import {ScholarClient, normalizeArxivId} from './core.js';
const $ = id => document.getElementById(id);
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
async function renderPopupTimings() {
  try {
    const {popupTimingsV1 = [], popupBenchmarkMode = 'optimized'} = await chrome.storage.session.get(['popupTimingsV1', 'popupBenchmarkMode']);
    $('popup-mode').textContent = `Toolbar popup mode: ${popupBenchmarkMode}.`;
    $('popup-data').textContent = JSON.stringify(popupTimingsV1, null, 2);
    $('popup-status').textContent = popupTimingsV1.length ? `${popupTimingsV1.length} popup opens recorded this browser session.` : 'Open the toolbar popup on a paper, close it, and open it again, then refresh these timings.';
  } catch { $('popup-status').textContent = 'Reload the extension to enable session storage, then retry.'; }
}
$('popup-refresh').addEventListener('click', renderPopupTimings);
$('popup-clear').addEventListener('click', async () => {
  try { await chrome.storage.session.remove('popupTimingsV1'); await renderPopupTimings(); }
  catch { $('popup-status').textContent = 'Could not clear the local timing records.'; }
});
renderPopupTimings();
for (const mode of ['baseline', 'optimized']) {
  $(`mode-${mode}`).addEventListener('click', async () => {
    try {
      const result = await chrome.runtime.sendMessage({type: 'benchmarkMode', mode});
      if (!result?.ok) throw Error(result?.error || 'Reload the extension first.');
      await renderPopupTimings();
      $('popup-status').textContent = 'Lookup cache cleared. Open a paper, close the popup once it is ready, then reopen it to measure first and repeat opens.';
    } catch (error) { $('popup-status').textContent = error.message; }
  });
}
class TimedClient extends ScholarClient {
  times = {};
  async request(path, body) {
    const label = path === '/session_info' ? 'login' : path === '/search' ? 'search' : path.startsWith('/papers/') ? 'details' : path === '/get_all_user_collections' ? 'collections' : 'other';
    const start = performance.now();
    try { return await super.request(path, body); }
    finally { this.times[label] = Math.round(performance.now() - start); }
  }
  async arxivPage(id) {
    const start = performance.now();
    try { return await super.arxivPage(id); }
    finally { this.times.arxiv = Math.round(performance.now() - start); }
  }
}
$('run').addEventListener('click', async () => {
  const id = normalizeArxivId($('arxiv').value);
  if (!id) { $('status').textContent = 'Enter a valid arXiv ID.'; return; }
  $('run').disabled = true; $('arxiv').disabled = true;
  $('rows').replaceChildren(); $('summary').textContent = ''; $('data').textContent = '';
  const results = [];
  try {
    for (const mode of ['sequential','parallel','parallel','sequential','sequential','parallel']) {
      $('status').textContent = `Running ${results.length + 1} of 6: ${mode}…`;
      const client = new TimedClient();
      const start = performance.now();
      const html = await client.arxivPage(id);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const title = doc.querySelector('meta[name="citation_title"]')?.content || doc.querySelector('h1.title')?.textContent?.replace(/^\s*Title:\s*/, '');
      if (!title?.trim()) throw new Error('No arXiv title found.');
      const found = await client.lookup(id, title.trim(), {parallel: mode === 'parallel'});
      const result = {run: results.length + 1, mode, total: Math.round(performance.now() - start), ...client.times, collectionCount: found.collections.length};
      results.push(result);
      const row = document.createElement('tr');
      for (const value of [`${result.run}. ${mode}`,result.total,result.arxiv,result.login,result.search,result.details,result.collections]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      $('rows').append(row); $('data').textContent = JSON.stringify(results, null, 2);
    }
    const sequential = median(results.filter(r=>r.mode==='sequential').map(r=>r.total));
    const parallel = median(results.filter(r=>r.mode==='parallel').map(r=>r.total));
    $('summary').textContent = `Median total: sequential ${sequential} ms; parallel ${parallel} ms. Difference: ${sequential-parallel} ms (${((sequential-parallel)/sequential*100).toFixed(1)}%).`;
    $('status').textContent = 'Complete. Each run matched the paper and loaded the collections. No papers were saved.';
  } catch (error) { $('status').textContent = `Stopped: ${error.message}`; }
  finally { $('run').disabled = false; $('arxiv').disabled = false; }
});
