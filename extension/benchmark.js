import {ScholarClient, normalizeArxivId} from './core.js';
const $ = id => document.getElementById(id);
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
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
