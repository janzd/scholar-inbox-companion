import test from 'node:test';
import assert from 'node:assert/strict';
import {ScholarClient, arxivIdFromUrl, normalizeArxivId, exactPaper, slugFromPaper, API} from '../extension/core.js';

const arxivId = '2609.04649';
const paper = {paper_id: 4842939, arxiv_id: arxivId, cache_file_name: 'Mahajan2026ARXIV_ReaDiT_Guidance_Control_for.pdf', title: 'ReaDiT Guidance', authors: 'Jay Mahajan et al.', user_paper_collections: []};
const collection = {id: 12, name: 'Diffusion Models', permission: 'owner'};
const selection = {slug: slugFromPaper(paper), arxivId, paperId: paper.paper_id, collectionId: '12'};

function setup({preSaved=false, saveSuccess=true, readBack=true, permission='owner', detailId=arxivId, authenticated=true, saveThrows=false}={}) {
  const calls=[]; let wrote=false;
  const fetch = async (url, options) => {
    const path=url.slice(API.length); const body=options.body ? JSON.parse(options.body) : undefined;
    calls.push({path,body,options});
    let data;
    if (path==='/session_info') data={is_logged_in:true};
    else if (path==='/get_all_user_collections') data={collections:[{...collection,permission}]};
    else if (path.startsWith('/papers/')) data={success:true,is_authenticated:authenticated,paper:{...paper,arxiv_id:detailId,user_paper_collections:preSaved || (wrote && readBack) ? [{id:12}] : []}};
    else if (path==='/search') data={success:true,digest_df:[{...paper,arxiv_id:'2609.00001'},paper]};
    else if (path==='/add_paper_to_collection/') {wrote=true;if(saveThrows)throw Error('timeout');data={success:saveSuccess};}
    else throw Error('Unexpected endpoint '+path);
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  };
  return {client:new ScholarClient(fetch),calls,writes:()=>calls.filter(c=>c.path==='/add_paper_to_collection/')};
}

test('arXiv URLs normalize abstract, PDF, HTML, versions, legacy IDs and fragments',()=>{
  for(const url of ['https://arxiv.org/abs/2609.04649','https://arxiv.org/pdf/2609.04649v3.pdf#page=2','https://arxiv.org/html/2609.04649v2','https://arxiv.org/abs/2609.04649?utm_source=test'])assert.equal(arxivIdFromUrl(url),arxivId);
  assert.equal(arxivIdFromUrl('https://arxiv.org/pdf/hep-th/9901001v2'),'hep-th/9901001');
  assert.equal(normalizeArxivId('arXiv:2609.04649v2'),arxivId);
});
test('unrelated hosts, path tricks and non-paper pages do not trigger a lookup',()=>{
  for(const url of ['https://arxiv.org.evil.test/abs/2609.04649','https://evil.test/arxiv.org/abs/2609.04649','https://arxiv.org/search/?q=2609.04649','https://arxiv.org/abs/2609.04649/extra','file:///pdf/2609.04649','https://user@arxiv.org/abs/2609.04649'])assert.equal(arxivIdFromUrl(url),null,url);
});
test('matching uses the arXiv ID, not title similarity or first-result order',()=>{
  assert.equal(exactPaper([{...paper,arxiv_id:'2609.00001'},paper],arxivId),paper);
  assert.equal(exactPaper([{...paper,arxiv_id:'2609.00001'}],arxivId),null);
  assert.throws(()=>exactPaper([paper,{...paper,paper_id:3}],arxivId),/multiple/);
});
test('lookup verifies authenticated detail and returns the server collection list',async()=>{
  const {client,calls}=setup();const result=await client.lookup(arxivId,'ReaDiT Guidance');
  assert.equal(result.paper.paperId,paper.paper_id);assert.equal(result.paper.slug,selection.slug);assert.equal(result.collections[0].id,'12');
  const search=calls.find(c=>c.path==='/search');assert.equal(search.body.correct_search_prompt,false);assert.deepEqual(search.body.searchIn,['title']);
  for(const call of calls)assert.equal(call.options.credentials,'include');
});
test('save checks identity and permissions, sends one write, then reads back membership',async()=>{
  const {client,calls,writes}=setup();assert.deepEqual(await client.save(selection),{state:'saved',collectionName:'Diffusion Models'});
  assert.equal(writes().length,1);assert.deepEqual(writes()[0].body,{collection_id:'12',collection_name:'Diffusion Models',paper_id:'4842939'});
  assert.ok(calls.at(-1).path.startsWith('/papers/'));
});
test('already saved is confirmed without a write',async()=>{
  const {client,writes}=setup({preSaved:true});assert.equal((await client.save(selection)).state,'already_saved');assert.equal(writes().length,0);
});
test('read-only or unrecognized collection permission prevents writes',async()=>{
  for(const permission of ['viewer',undefined,'unknown']){const {client,writes}=setup({permission:permission??'unknown'});await assert.rejects(client.save(selection),/read-only/);assert.equal(writes().length,0);}
});
test('mismatched arXiv IDs, stale records and expired authentication prevent writes',async()=>{
  let env=setup({detailId:'2609.00001'});await assert.rejects(env.client.save(selection),/mismatch/);assert.equal(env.writes().length,0);
  env=setup();await assert.rejects(env.client.save({...selection,paperId:1}),/record changed/);assert.equal(env.writes().length,0);
  env=setup({authenticated:false});await assert.rejects(env.client.save(selection),/session/);assert.equal(env.writes().length,0);
});
test('failed or uncertain saves never claim success and never auto-retry',async()=>{
  for(const options of [{saveSuccess:false},{readBack:false},{saveThrows:true}]){const {client,writes}=setup(options);assert.equal((await client.save(selection)).state,'unconfirmed');assert.equal(writes().length,1);}
});
test('rate limits stop requests without a retry loop',async()=>{
  let count=0;const client=new ScholarClient(async()=>{count++;return new Response('{}',{status:429,headers:{'Retry-After':'120'}});});
  await assert.rejects(client.lookup(arxivId,'ReaDiT'),/120 seconds/);assert.equal(count,1);
});
test('paper link is restricted to a cache name',()=>{
  for(const cache_file_name of ['../settings','https://evil.test/x','a/b.pdf'])assert.throws(()=>slugFromPaper({cache_file_name}));
});

test('default fetch preserves the browser global receiver', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function () {
    assert.equal(this, globalThis);
    return new Response(JSON.stringify({is_logged_in: true}), {status: 200});
  };
  try { await new ScholarClient().session(); }
  finally { globalThis.fetch = original; }
});

test('lookup overlaps collections with search and detail, and waits for both branches', async () => {
  const {client, calls} = setup();
  const fetch = client.fetch;
  let releaseSearch, releaseCollections;
  const searchGate = new Promise(resolve => { releaseSearch = resolve; });
  const collectionGate = new Promise(resolve => { releaseCollections = resolve; });
  const started = [];
  client.fetch = async (url, options) => {
    const path = url.slice(API.length);
    started.push(path);
    if (path === '/search') await searchGate;
    if (path === '/get_all_user_collections') await collectionGate;
    return fetch(url, options);
  };
  let done = false;
  const pending = client.lookup(arxivId, 'ReaDiT Guidance').then(result => { done = true; return result; });
  await new Promise(setImmediate);
  assert.deepEqual(started, ['/session_info', '/search', '/get_all_user_collections']);
  releaseSearch();
  await new Promise(setImmediate);
  assert.ok(started.some(path => path.startsWith('/papers/')));
  assert.equal(done, false, 'must not show a paper before collections finish');
  releaseCollections();
  const result = await pending;
  assert.equal(result.paper.paperId, paper.paper_id);
  assert.equal(result.collections[0].id, '12');
  assert.equal(calls.filter(c => c.path === '/search').length, 1);
});

test('parallel lookup rejects a failed collection branch instead of showing incomplete data', async () => {
  const {client, writes} = setup();
  const fetch = client.fetch;
  client.fetch = (url, options) => url.endsWith('/get_all_user_collections')
    ? Promise.resolve(new Response('{}', {status: 503})) : fetch(url, options);
  await assert.rejects(client.lookup(arxivId, 'ReaDiT Guidance'), /503/);
  assert.equal(writes().length, 0);
});
