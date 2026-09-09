import test from 'node:test';
import assert from 'node:assert/strict';
import {ScholarClient, API, slugFromPaper} from '../extension/core.js';

const record = {paper_id: 42, title: 'Segment and Caption Anything', authors: 'Xiaoke Huang, Jianfeng Wang',
  arxiv_id: null, cache_file_name: 'Huang2024_Segment.pdf', publication_date: '2024-06-01', user_paper_collections: []};
function environment(rows = [record], detail = record, {readBack = true, permission = 'owner'} = {}) {
  let saved = false; const calls = [];
  const client = new ScholarClient(async (url, options) => {
    const path = url.slice(API.length); calls.push({path, options});
    const response = path === '/session_info' ? {is_logged_in: true}
      : path === '/search' ? {digest_df: rows}
      : path === '/get_all_user_collections' ? {collections: [{id: 3, name: 'Vision', permission}]}
      : path.startsWith('/papers/') ? {is_authenticated: true, paper: {...detail, user_paper_collections: saved && readBack ? [{id: 3}] : []}}
      : path === '/add_paper_to_collection/' ? (saved = true, {success: true}) : {};
    return new Response(JSON.stringify(response));
  });
  return {client, calls, writes: () => calls.filter(c => c.path === '/add_paper_to_collection/')};
}

test('a unique normalized title opens authenticated detail without an extra choice', async () => {
  const {client, calls, writes} = environment(); const result = await client.resolve({title: 'SEGMENT & Caption Anything'});
  assert.equal(result.paper, undefined, 'similar titles still require selection');
  const exact = await client.resolve({title: '  Segment and Caption Anything!  '});
  assert.equal(exact.match, 'title'); assert.equal(exact.paper.paperId, 42);
  assert.equal(exact.paper.arxivId, null); assert.equal(exact.paper.year, '2024');
  assert.equal(calls.some(c => c.path.startsWith('/papers/')), true);
  assert.equal(writes().length, 0);
});

test('unique exact identifiers auto-match; conflicting identifiers exclude results', async () => {
  const exact = {...record, arxiv_id: '2401.01234'};
  const {client} = environment([{...exact, paper_id: 41, arxiv_id: '2401.99999'}, exact], exact);
  const result = await client.resolve({title: record.title, arxivId: '2401.01234v2'});
  assert.equal(result.match, 'exact'); assert.equal(result.paper.paperId, 42);
  const doiRecord = {...record, doi: '10.1234/ABC'};
  const doi = await environment([doiRecord], doiRecord).client.resolve({title: record.title, doi: 'https://doi.org/10.1234/abc'});
  assert.equal(doi.paper.paperId, 42);
  const conflict = await environment([doiRecord]).client.resolve({title: record.title, doi: '10.1234/other'});
  assert.deepEqual(conflict.candidates, []);
});

test('duplicates are collapsed but ambiguous exact IDs require selection', async () => {
  const exact = {...record, arxiv_id: '2401.01234'};
  const {client} = environment([exact, exact, {...exact, paper_id: 43}]);
  const result = await client.resolve({title: record.title, arxivId: '2401.01234'});
  assert.equal(result.paper, undefined); assert.equal(result.candidates.length, 2);
});

test('title, author and year evidence rank candidates without auto-selecting one', async () => {
  const rows = [{...record, paper_id: 40, authors: 'Someone Else'}, {...record, paper_id: 41, title: 'Caption Models'}, record];
  const {client} = environment(rows);
  const result = await client.resolve({title: record.title, authors: ['Huang, Xiaoke'], year: '2024'});
  assert.equal(result.paper, undefined); assert.equal(result.candidates[0].paperId, 42);
});

test('bad candidates and mismatched source IDs cannot silently select a paper', async () => {
  const {client} = environment([{...record, paper_id: 'bad'}, {...record, cache_file_name: '../settings'}, {...record, arxiv_id: '2401.99999'}]);
  assert.deepEqual((await client.resolve({title: record.title, arxivId: '2401.01234'})).candidates, []);
  await assert.rejects(client.choose({paperId: 41, title: record.title, slug: slugFromPaper(record)}), /record changed/);
  await assert.rejects(client.choose({paperId: 42, title: 'A different paper', slug: slugFromPaper(record)}), /title changed/);
});

test('non-arXiv save verifies selected title and ID, current permissions, and read-back', async () => {
  const {client, writes} = environment();
  const {paper} = await client.resolve({title: record.title});
  assert.equal((await client.save({...paper, collectionId: '3'})).state, 'saved'); assert.equal(writes().length, 1);
  assert.equal((await client.save({...paper, collectionId: '3'})).state, 'already_saved'); assert.equal(writes().length, 1);
  for (const bad of [{title: 'Wrong paper'}, {paperId: 10}, {title: undefined}]) {
    await assert.rejects(client.save({...paper, collectionId: '3', ...bad})); assert.equal(writes().length, 1);
  }
  const readonly = environment([record], record, {permission: 'viewer'});
  await assert.rejects(readonly.client.save({...paper, collectionId: '3'}), /read-only/); assert.equal(readonly.writes().length, 0);
  const uncertain = environment([record], record, {readBack: false});
  assert.equal((await uncertain.client.save({...paper, collectionId: '3'})).state, 'unconfirmed'); assert.equal(uncertain.writes().length, 1);
});
