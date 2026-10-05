import test from 'node:test';
import assert from 'node:assert/strict';
import {relevanceScore,paperRating,digestPaper,digestAccount} from '../extension/digest-core.js';
import {readFeedback,rateFeedback} from '../extension/digest-feedback.js';
const raw={paper_id:42,cache_file_name:'Example.pdf',title:'Example',rating:0};
async function fixture(){
 const h={username:'alice',rating:0,id:42,auth:true,posts:[],reads:0,failPost:false,failReadback:false,ignorePost:false};
 h.input={paper:{paperId:42,slug:'Example'},accountKey:await digestAccount('alice'),rating:1,expectedRating:0};
 h.client={request:async(path,body)=>{
  if(path==='/session_info')return {is_logged_in:h.auth,username:h.username};
  if(path==='/make_rating/'){h.posts.push(body);if(h.failPost)throw Error('network');if(!h.ignorePost)h.rating=body.rating;return {success:true};}
  if(path==='/papers/Example'){h.reads++;if(h.failReadback&&h.posts.length)throw Error('offline');return {is_authenticated:h.auth,paper:{...raw,paper_id:h.id,rating:h.rating}};}
  assert.fail('Unexpected path '+path);
 }};return h;
}
test('relevance matches the website scale, includes zero/negative, and missing scores are not invented',()=>{
 for(const [value,expected] of [[0,-100],[0.5,0],[1,100],[0.9349,87],['0.75',50]])assert.equal(relevanceScore(value),expected);
 for(const value of [null,undefined,'',false,[],{},NaN,Infinity,-0.1,1.01,'bad'])assert.equal(relevanceScore(value),null);
 assert.equal(digestPaper({...raw,ranking_score:0.5}).relevanceScore,0);
 assert.equal(digestPaper(raw).relevanceScore,null);
 assert.equal(paperRating({...raw,rating:null}),0);assert.equal(paperRating({}),null);
});
test('like, dislike and removal issue one numeric rating/string-id write and confirm fresh server state',async()=>{
 const h=await fixture();
 for(const rating of [1,-1,0]){const previous=h.rating;const result=await rateFeedback(h.client,{...h.input,rating,expectedRating:previous});assert.equal(result.rating,rating);}
 assert.deepEqual(h.posts,[{rating:1,id:'42'},{rating:-1,id:'42'},{rating:0,id:'42'}]);assert.equal(h.reads,6);
});
test('already applied intent needs no write; stale state cannot accidentally toggle another rating',async()=>{
 const h=await fixture();h.rating=1;assert.equal((await rateFeedback(h.client,h.input)).rating,1);assert.equal(h.posts.length,0);
 h.rating=-1;await assert.rejects(()=>rateFeedback(h.client,h.input),e=>e.code==='RATING_CHANGED');assert.equal(h.posts.length,0);
});
test('account changes, signed-out state, identity mismatch and invalid inputs are rejected before writing',async()=>{
 const h=await fixture();h.username='bob';await assert.rejects(()=>rateFeedback(h.client,h.input),e=>e.code==='ACCOUNT_CHANGED');
 h.username='alice';h.auth=false;await assert.rejects(()=>rateFeedback(h.client,h.input),e=>e.code==='AUTH_REQUIRED');
 h.auth=true;h.id=43;await assert.rejects(()=>rateFeedback(h.client,h.input),/record changed/);h.id=42;
 for(const rating of [2,'1',null])await assert.rejects(()=>rateFeedback(h.client,{...h.input,rating}));
 await assert.rejects(()=>rateFeedback(h.client,{...h.input,paper:{paperId:42,slug:'../settings'}}));assert.equal(h.posts.length,0);
});
test('uncertain writes, mismatched readback and failed readback never retry',async()=>{
 for(const flag of ['failPost','ignorePost','failReadback']){const h=await fixture();h[flag]=true;await assert.rejects(()=>rateFeedback(h.client,h.input),e=>e.code==='RATING_UNCERTAIN');assert.equal(h.posts.length,1);}
});
test('refresh reads current rating without submitting any vote',async()=>{
 const h=await fixture();h.rating=-1;assert.equal((await readFeedback(h.client,h.input)).rating,-1);assert.equal(h.posts.length,0);
});


test('rating transport accepts an empty successful response but still rejects HTTP and JSON errors',async()=>{
  const {ScholarClient}=await import('../extension/core.js');
  let response=new Response(null,{status:204});const client=new ScholarClient(async()=>response);
  assert.deepEqual(await client.request('/make_rating/',{rating:1,id:'42'},{allowEmpty:true}),{});
  response=new Response(JSON.stringify({success:false}),{status:200});await assert.rejects(()=>client.request('/make_rating/',{rating:1,id:'42'},{allowEmpty:true}));
  response=new Response(null,{status:403});await assert.rejects(()=>client.request('/make_rating/',{rating:1,id:'42'},{allowEmpty:true}),e=>e.code==='AUTH_REQUIRED');
});
