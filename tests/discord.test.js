import test from 'node:test';
import assert from 'node:assert/strict';
import {DiscordDelivery,webhookUrl,discordMessage,DISCORD_CONFIG} from '../extension/discord.js';
import {digestAccount} from '../extension/digest-core.js';
const ID='123456789012345678',CHANNEL='223456789012345678',MESSAGE='323456789012345678';
const WEBHOOK=`https://discord.com/api/webhooks/${ID}/DEMO_NotARealWebhookToken0000`;
const TOKEN='DEMO_NotARealDiscordBotToken000000000';
function harness(){
 const store={},calls=[];const h={permission:true,user:'alice'};
 h.api={storage:{local:{setAccessLevel:async v=>{h.access=v},get:async()=>structuredClone(store),set:async d=>Object.assign(store,structuredClone(d)),remove:async k=>delete store[k]}},permissions:{contains:async v=>{h.origins=v.origins;return h.permission;}}};
 h.client={session:async()=>{},request:async()=>({username:h.user})};
 h.adapter=new DiscordDelivery({api:h.api,client:h.client,fetchFn:async(url,options)=>{calls.push({url,options});if(h.fail)throw Error(TOKEN);return Response.json(h.body??(url.endsWith('/users/@me/channels')?{id:CHANNEL,type:1}:{id:MESSAGE}),{status:h.http||200});}});
 h.store=store;h.calls=calls;h.result=async()=>({accountKey:await digestAccount('alice'),date:'2026-10-06'});return h;
}
test('Discord validates exact webhook endpoints and rejects injected message dates',()=>{
 assert.equal(webhookUrl(WEBHOOK),WEBHOOK);
 assert.equal(webhookUrl(WEBHOOK.replace('/api/','/api/v10/')),WEBHOOK.replace('/api/','/api/v10/'));
 for(const url of [WEBHOOK+'?x=1',WEBHOOK+'#x',WEBHOOK.replace('https:','http:'),WEBHOOK.replace('discord.com','discord.com.evil.test'),WEBHOOK.replace('discord.com','user@discord.com'),WEBHOOK.replace('/api/','/other/'),'file:///tmp/x'])assert.equal(webhookUrl(url),null);
 assert.throws(()=>discordMessage('2026-10-06 @everyone'));
 assert.deepEqual(discordMessage('2026-10-06').allowed_mentions,{parse:[]});
});
test('configuration defaults off, redacts secrets, replaces credentials and removes cleanly',async()=>{
 const h=harness();assert.equal((await h.adapter.status()).enabled,false);
 await h.adapter.configure({webhook:WEBHOOK,enabled:false});assert.equal(h.calls.length,0);
 assert.equal(JSON.stringify(await h.adapter.status()).includes('DEMO'),false);
 assert.deepEqual(h.access,{accessLevel:'TRUSTED_CONTEXTS'});
 await h.adapter.configure({mode:'dm',token:TOKEN,userId:ID,enabled:false});
 assert.equal(h.store[DISCORD_CONFIG].webhook,undefined);
 await h.adapter.configure({mode:'dm',token:'',userId:ID,enabled:false});assert.equal(h.store[DISCORD_CONFIG].token,TOKEN);
 assert.equal(JSON.stringify(await h.adapter.status()).includes(TOKEN),false);
 for(const values of [{userId:'@everyone'},{token:'bad'},{mode:'other'}])await assert.rejects(()=>h.adapter.configure({mode:'dm',token:TOKEN,userId:ID,enabled:false,...values}));
 await h.adapter.configure({remove:true,enabled:false});assert.equal((await h.adapter.status()).configured,false);
});
test('enabling requires Discord permission and an identified Scholar Inbox account',async()=>{
 const h=harness();h.permission=false;await assert.rejects(()=>h.adapter.configure({webhook:WEBHOOK,enabled:true}),/Allow access/);
 h.permission=true;h.user='';await assert.rejects(()=>h.adapter.configure({webhook:WEBHOOK,enabled:true}),/Sign in/);
 h.user='alice';await h.adapter.configure({webhook:WEBHOOK,enabled:true});assert.deepEqual(h.origins,['https://discord.com/*']);assert.equal(h.calls.length,0);
});
test('webhooks wait for message confirmation and persist receipts before sending',async()=>{
 const h=harness();await h.adapter.configure({webhook:WEBHOOK,enabled:true});const record={};const result=await h.result();
 await h.adapter.deliver(result,record,async()=>{assert.equal(h.calls.length,0);assert.equal(record.discordAttemptedDate,result.date);},()=>true);
 await h.adapter.deliver(result,record,async()=>{},()=>true);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,WEBHOOK+'?wait=true');
 assert.equal(h.calls[0].options.headers.Authorization,undefined);
 assert.deepEqual(JSON.parse(h.calls[0].options.body),discordMessage(result.date));assert.equal((await h.adapter.status()).status,'sent');
});
test('DM opens a bot conversation, then posts with Bot authorization and safe request options',async()=>{
 const h=harness();await h.adapter.configure({mode:'dm',token:TOKEN,userId:ID,enabled:true});const r={};
 await h.adapter.deliver(await h.result(),r,async()=>{},()=>true);
 assert.equal(h.calls.length,2);assert.equal(h.calls[0].url,'https://discord.com/api/v10/users/@me/channels');
 assert.deepEqual(JSON.parse(h.calls[0].options.body),{recipient_id:ID});
 assert.equal(h.calls[1].url,`https://discord.com/api/v10/channels/${CHANNEL}/messages`);
 for(const {options} of h.calls){assert.equal(options.headers.Authorization,`Bot ${TOKEN}`);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.body.includes(TOKEN),false);}
 assert.equal((await h.adapter.status()).status,'sent');
});
test('disabled, account-mismatched, permission-revoked and stale checks never send',async()=>{
 const h=harness();await h.adapter.configure({webhook:WEBHOOK,enabled:false});const result=await h.result();
 await h.adapter.deliver(result,{},async()=>{},()=>true);
 await h.adapter.configure({enabled:true});await h.adapter.deliver({...result,accountKey:'b'.repeat(64)},{},async()=>{},()=>true);
 h.permission=false;await h.adapter.deliver(result,{},async()=>{},()=>true);
 h.permission=true;await h.adapter.deliver(result,{},async()=>{},()=>false);assert.equal(h.calls.length,0);
});
test('HTTP rejection, malformed acknowledgement and uncertain delivery do not expose secrets or retry',async()=>{
 for(const scenario of ['http','invalid','network']){
 const h=harness();await h.adapter.configure({webhook:WEBHOOK,enabled:true});h.http=scenario==='http'?429:200;h.body={error:TOKEN};h.fail=scenario==='network';const r={};
 await h.adapter.deliver(await h.result(),r,async()=>{},()=>true);
 const restart=new DiscordDelivery({api:h.api,client:h.client,fetchFn:()=>assert.fail('must not retry')});await restart.deliver(await h.result(),r,async()=>{},()=>true);
 assert.equal((await h.adapter.status()).status,scenario==='network'?'uncertain':'failed');assert.equal(JSON.stringify(await h.adapter.status()).includes(TOKEN),false);
 }
});
test('DM rejects invalid or non-DM destinations and respects changes before posting',async()=>{
 for(const body of [{id:CHANNEL,type:0},{id:'../../evil',type:1},{code:50007}]){
 const h=harness();await h.adapter.configure({mode:'dm',token:TOKEN,userId:ID,enabled:true});h.body=body;
 await h.adapter.deliver(await h.result(),{},async()=>{},()=>true);assert.equal(h.calls.length,1);assert.equal((await h.adapter.status()).status,'failed');
 }
 const h=harness();await h.adapter.configure({mode:'dm',token:TOKEN,userId:ID,enabled:true});await h.adapter.deliver(await h.result(),{},async()=>{},()=>h.calls.length===0);assert.equal(h.calls.length,1);
});
