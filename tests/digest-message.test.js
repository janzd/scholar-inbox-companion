import test from 'node:test';
import assert from 'node:assert/strict';
import {slackDigestMessage,discordDigestMessage,enrichDigestPapers} from '../extension/digest-message.js';
import {digestAccount} from '../extension/digest-core.js';
const paper={paperId:42,slug:'Example',title:'Example paper',abstract:'A useful abstract.',scholarUrl:'https://www.scholar-inbox.com/paper/Example',url:'https://arxiv.org/abs/2611.00001',figures:[{url:'https://www.scholar-inbox.com/teaser_figures/42.0.jpeg'}]};
test('top five cards preserve relevance order, links, abstracts and leading figures',()=>{
 const papers=Array.from({length:6},(_,i)=>({...paper,title:`Paper ${i}`}));
 const slack=slackDigestMessage('2026-11-05',papers),discord=discordDigestMessage('2026-11-05',papers);
 assert.equal(slack.blocks.filter(b=>b.type==='image').length,5);
 assert.equal(discord.embeds.length,5);assert.equal(discord.flags,undefined);
 assert.deepEqual(discord.embeds.map(e=>e.title),papers.slice(0,5).map(p=>p.title));
 assert.equal(discord.embeds[0].description,paper.abstract);assert.equal(discord.embeds[0].image.url,paper.figures[0].url);
 assert.equal(discord.embeds[0].fields.length,2);assert.ok(!slack.text.includes('Paper 5'));
 assert.deepEqual(discord.allowed_mentions,{parse:[]});
});
test('long abstracts and titles remain within both platform limits',()=>{
 const papers=Array.from({length:5},()=>({...paper,title:'T'.repeat(500),abstract:'😀'.repeat(5000)}));
 const slack=slackDigestMessage('2026-11-05',papers),discord=discordDigestMessage('2026-11-05',papers);
 assert.ok(slack.blocks.length<=50);
 for(const b of slack.blocks)if(b.text)assert.ok(b.text.text.length<=3000);
 let total=0;for(const e of discord.embeds){assert.ok(e.title.length<=256);assert.ok(e.description.length<=4096);assert.ok(e.description.endsWith('…'));total+=e.title.length+e.description.length+(e.fields||[]).reduce((n,f)=>n+f.name.length+f.value.length,0);}
 assert.ok(total<=6000);
});
test('missing media, unsafe links and mentions cannot alter Slack blocks or ping Discord',()=>{
 const p={...paper,title:'<!here> <@U123> & test',abstract:'<!channel>',url:'javascript:alert(1)',scholarUrl:null,figures:[{url:'https://evil.test/image.png'}]};
 const slack=slackDigestMessage('2026-11-05',[p]),discord=discordDigestMessage('2026-11-05',[p]);
 assert.ok(!slack.text.includes('<!here>'));assert.equal(slack.blocks[2].text.type,'plain_text');
 assert.equal(slack.blocks.filter(b=>b.type==='image').length,0);assert.equal(discord.embeds[0].image,undefined);assert.equal(discord.embeds[0].fields,undefined);
 assert.deepEqual(discord.allowed_mentions,{parse:[]});
 const fallback={...paper,figures:[],firstPage:{url:'https://www.scholar-inbox.com/first_pages/42.jpeg'}};
 assert.ok(discordDigestMessage('2026-11-05',[fallback]).embeds[0].image.url.includes('first_pages'));
 assert.equal(discordDigestMessage('2026-11-05',[]).embeds,undefined);
});
test('enrichment requests at most two details concurrently, preserves order, and checks account',async()=>{
 let active=0,max=0;const calls=[];const key=await digestAccount('alice');
 const client={session:async()=>{},request:async path=>{
  calls.push(path);if(path==='/')return {username:'alice'};
  active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;
  const id=Number(path.split('/').at(-1).slice(1));
  return {is_authenticated:true,paper:{paper_id:id,title:`Paper ${id}`,authors:'Author',cache_file_name:`P${id}.pdf`,abstract:'Enriched',teaser_figures:[{imageUrl:`/teaser_figures/${id}.0.jpeg`}]}};
 }};
 const papers=Array.from({length:6},(_,i)=>({...paper,paperId:i+1,slug:`P${i+1}`,abstract:'',figures:[]}));
 const result=await enrichDigestPapers(client,papers,key);
 assert.equal(result.length,5);assert.equal(max,2);assert.deepEqual(result.map(p=>p.paperId),[1,2,3,4,5]);assert.equal(result[0].abstract,'Enriched');assert.equal(calls.length,6);
 await assert.rejects(()=>enrichDigestPapers(client,[paper],'b'.repeat(64)),/Digest account changed/);
});
test('missing detail is optional; authentication and account changes prevent sending',async()=>{
 const client={session:async()=>{},request:async path=>{if(path==='/')return {username:'alice'};throw Error('Detail unavailable');}};
 const key=await digestAccount('alice');const result=await enrichDigestPapers(client,[{...paper,figures:[]}],key);
 assert.equal(result[0].abstract,paper.abstract);
 client.session=async()=>{throw Object.assign(Error('Signed out'),{code:'AUTH_REQUIRED'});};
 await assert.rejects(()=>enrichDigestPapers(client,[paper],key),/Signed out/);
});

test('both delivery adapters use enriched cards and persist only date receipts',async()=>{
 const {SlackDelivery}=await import('../extension/slack.js');const {DiscordDelivery}=await import('../extension/discord.js');
 for(const [Adapter,webhook] of [[SlackDelivery,'https://hooks.slack.com/services/DEMO_WORKSPACE/DEMO_CHANNEL/NotARealWebhookToken0000'],[DiscordDelivery,'https://discord.com/api/webhooks/123456789012345678/DEMO_NotARealWebhookToken0000']]){
  const store={};let payload,reads=0;const key=await digestAccount('alice');
  const api={storage:{local:{get:async()=>store,set:async d=>Object.assign(store,d)}},permissions:{contains:async()=>true}};
  const client={session:async()=>{},request:async()=>({username:'alice'})};
  const adapter=new Adapter({api,client,fetchFn:async(url,options)=>{payload=JSON.parse(options.body);return Adapter===SlackDelivery?new Response('ok'):Response.json({id:'123456789012345678'});}});
  await adapter.configure({enabled:true,webhook});const record={};
  const result={accountKey:key,date:'2026-11-05',getPapers:async()=>{reads++;return [paper];}};
  await adapter.deliver(result,record,async()=>{},()=>true);await adapter.deliver(result,record,async()=>{},()=>true);
  assert.equal(reads,1);assert.ok(JSON.stringify(payload).includes(paper.abstract));assert.ok(JSON.stringify(payload).includes(paper.figures[0].url));
  assert.ok(!JSON.stringify(record).includes(paper.title));assert.ok(!JSON.stringify(store).includes(paper.abstract));
 }
});
