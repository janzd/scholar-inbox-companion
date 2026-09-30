import test from 'node:test';
import assert from 'node:assert/strict';
import {digestDate,digestQuery,paperUrl,figureUrl,digestPaper,normalizeDigest,loadDigest,loadDigestDetail} from '../extension/digest-core.js';
const paper={paper_id:42,title:'A useful paper',authors:'Example Author',cache_file_name:'Example_2026.pdf',publication_date:'2026-09-07',arxiv_id:'2609.00001',abstract:'An abstract.',url:'https://arxiv.org/pdf/2609.00001',teaser_figures:[{imageUrl:'/teaser_figures/42.0.jpeg',figureType:'Table',caption:'Table caption'},{imageUrl:'/teaser_figures/42.1.jpeg',figureType:'Figure',caption:'Figure caption'}]};

test('digest dates validate calendar dates and translate to the website format',()=>{
  assert.equal(digestDate('09-07-2026'),'2026-09-07');
  assert.equal(digestDate('2024-02-29'),'2024-02-29');
  assert.equal(digestDate('2026-09-04 00:00:00'),'2026-09-04');
  for(const value of ['2026-02-29','2026-02-31','13-01-2026','2026-1-1','garbage',null]) assert.equal(digestDate(value),null);
  assert.equal(digestQuery(),'/');
  assert.equal(digestQuery({date:'2026-09-07',page:1}),'/?date=09-07-2026&p=1');
  for(const page of [-1,1.5,'1',101]) assert.throws(()=>digestQuery({date:'2026-09-07',page}));
  assert.throws(()=>digestQuery({page:1}));
  assert.throws(()=>digestQuery({date:'09-07-2026'}));
});

test('paper links and figure sources reject active URLs, foreign hosts, and other paper identifiers',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,x','file:///tmp/x','https://user:secret@site.test/paper'])assert.equal(paperUrl(url),null);
  assert.equal(paperUrl('https://example.org/paper.pdf'),'https://example.org/paper.pdf');
  assert.equal(figureUrl('/teaser_figures/42.1.jpeg',42),'https://www.scholar-inbox.com/teaser_figures/42.1.jpeg');
  for(const url of ['https://evil.test/teaser_figures/42.1.jpeg','//evil.test/teaser_figures/42.1.jpeg','/teaser_figures/43.1.jpeg','/teaser_figures/42.1.jpeg?token=x','/teaser_figures/42.1.svg','/api/logout','javascript:x'])assert.equal(figureUrl(url,42),null);
  assert.equal(figureUrl('/first_pages/42.jpeg',42,true),'https://www.scholar-inbox.com/first_pages/42.jpeg');
});

test('digest normalization preserves order, deduplicates papers and figures, and tolerates missing figures',()=>{
  const data=normalizeDigest({digest_df:[paper,paper,{paper_id:'invalid'}],current_digest_date:'09-07-2026',has_more_papers_in_digest:true,prev_date:'09-04-2026'});
  assert.equal(data.papers.length,1);assert.equal(data.skipped,1);assert.equal(data.date,'2026-09-07');assert.equal(data.previousDate,'2026-09-04');assert.equal(data.hasMore,true);
  assert.equal(data.papers[0].figures[0].label,'Figure');
  const raw={...paper,teaser_figures:[...paper.teaser_figures,paper.teaser_figures[0],{imageUrl:'https://evil.test/x'}]};
  assert.equal(digestPaper(raw).figures.length,2);
  const missing=digestPaper({...paper,teaser_figures:undefined,first_page_image:{imageUrl:'/first_pages/42.jpeg'}});
  assert.equal(missing.figures.length,0);assert.equal(missing.firstPage.label,'First page');
  assert.equal(digestPaper({...paper,teaser_figures:undefined,first_page_image:{imageUrl:'/first_pages/43.jpeg'}}).firstPage,null);
  assert.equal(digestPaper({...paper,url:'javascript:x'}).url,'https://arxiv.org/abs/2609.00001');
  assert.throws(()=>normalizeDigest({is_authenticated:false,digest_df:[]}),e=>e.code==='AUTH_REQUIRED');
  assert.throws(()=>normalizeDigest({success:true}));
});

test('digest retrieval checks sign-in before loading personal data and rejects invalid inputs before any request',async()=>{
  const calls=[];
  const client={session:async()=>calls.push('session'),request:async path=>{calls.push(path);return{digest_df:[paper],current_digest_date:'09-07-2026'}}};
  await loadDigest(client,{date:'2026-09-07'});assert.deepEqual(calls,['session','/?date=09-07-2026']);
  calls.length=0;await assert.rejects(()=>loadDigest(client,{page:-1}));assert.deepEqual(calls,[]);
  client.session=async()=>{throw Object.assign(new Error('Signed out'),{code:'AUTH_REQUIRED'})};
  await assert.rejects(()=>loadDigest(client),e=>e.code==='AUTH_REQUIRED');assert.deepEqual(calls,[]);
});

test('detail enrichment requires authentication and the same paper identity',async()=>{
  let requests=0;let response={is_authenticated:true,paper};
  const client={session:async()=>{},request:async()=>{requests++;return response}};
  const identity={paperId:42,slug:'Example_2026'};
  assert.equal((await loadDigestDetail(client,identity)).paperId,42);
  for(const slug of ['../settings','x?token=secret','x/y'])await assert.rejects(()=>loadDigestDetail(client,{...identity,slug}));
  assert.equal(requests,1);
  response={is_authenticated:false,paper};await assert.rejects(()=>loadDigestDetail(client,identity),e=>e.code==='AUTH_REQUIRED');
  response={is_authenticated:true,paper:{...paper,paper_id:43}};await assert.rejects(()=>loadDigestDetail(client,identity),/record changed/);
});


test('Latest resolves a saved range to its final daily digest and supports current range-date responses',async()=>{
  const calls=[];
  const client={session:async()=>{},request:async path=>{calls.push(path);return path==='/'
    ?{digest_df:[paper],from_date:'2026-09-01',to_date:'2026-09-07'}
    :{digest_df:[paper],from_date:'2026-09-07',to_date:'2026-09-07',has_more_papers_in_digest:true}}};
  const result=await loadDigest(client);
  assert.deepEqual(calls,['/','/?date=09-07-2026']);assert.equal(result.date,'2026-09-07');assert.equal(result.hasMore,true);
});
