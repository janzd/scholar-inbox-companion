import test from 'node:test';
import assert from 'node:assert/strict';
import {SlackDelivery,webhookUrl,slackMessage,SLACK_CONFIG} from '../extension/slack.js';
import {digestAccount} from '../extension/digest-core.js';
const WEBHOOK='https://hooks.slack.com/services/DEMO_WORKSPACE/DEMO_CHANNEL/NotARealWebhookToken0000';
function harness(){const store={},calls=[];const h={permission:true,user:'alice',fail:false};
  h.api={storage:{local:{setAccessLevel:async v=>{h.access=v},get:async()=>structuredClone(store),set:async d=>Object.assign(store,structuredClone(d)),remove:async k=>delete store[k]}},permissions:{contains:async()=>h.permission}};
  h.client={session:async()=>{},request:async()=>({username:h.user})};
  h.slack=new SlackDelivery({api:h.api,client:h.client,fetchFn:async(url,options)=>{calls.push({url,options});if(h.fail)throw Error(WEBHOOK);return new Response(h.body||'ok',{status:h.status||200})}});
  h.store=store;h.calls=calls;return h;
}
test('webhook validation allows only HTTPS Slack service endpoints',()=>{
  assert.equal(webhookUrl(WEBHOOK),WEBHOOK);
  for(const u of ['http://hooks.slack.com/services/DEMO_WORKSPACE/DEMO_CHANNEL/NotARealWebhookToken0000',WEBHOOK+'?token=x',WEBHOOK+'#x',WEBHOOK.replace('hooks.slack.com','hooks.slack.com.evil.test'),WEBHOOK.replace('hooks.slack.com','user:pass@hooks.slack.com'),WEBHOOK.replace('hooks.slack.com','hooks.slack.com:9999'),'https://hooks.slack.com/api/chat.postMessage','file:///tmp/x','javascript:alert(1)'])assert.equal(webhookUrl(u),null);
});
test('saving webhook is offline and off by default; status never returns its secret',async()=>{
  const h=harness();assert.equal((await h.slack.status()).enabled,false);
  await h.slack.configure({webhook:WEBHOOK,enabled:false});
  assert.equal(h.calls.length,0);assert.equal((await h.slack.status()).configured,true);assert.equal(JSON.stringify(await h.slack.status()).includes('NotAReal'),false);
  assert.deepEqual(h.access,{accessLevel:'TRUSTED_CONTEXTS'});
  await h.slack.configure({enabled:false,remove:true});assert.equal((await h.slack.status()).configured,false);
});
test('enabling requires permission and binds to the signed-in account without sending',async()=>{
  const h=harness();h.permission=false;await assert.rejects(()=>h.slack.configure({webhook:WEBHOOK,enabled:true}),/Allow access/);
  h.permission=true;h.user='';await assert.rejects(()=>h.slack.configure({webhook:WEBHOOK,enabled:true}),/Sign in/);
  h.user='alice';await h.slack.configure({webhook:WEBHOOK,enabled:true});assert.equal(h.calls.length,0);assert.equal(h.store[SLACK_CONFIG].accountKey,await digestAccount('alice'));
});
test('delivery sends only date/link text, never retries the same date, and has no browser credentials or redirects',async()=>{
  const h=harness();await h.slack.configure({webhook:WEBHOOK,enabled:true});const record={};let persisted=false;
  const result={accountKey:await digestAccount('alice'),date:'2026-09-30'};
  const send=()=>h.slack.deliver(result,record,async()=>{persisted=true},()=>true);
  await send();await send();assert.equal(persisted,true);assert.equal(h.calls.length,1);
  const req=h.calls[0];assert.equal(req.options.credentials,'omit');assert.equal(req.options.redirect,'error');
  assert.deepEqual(JSON.parse(req.options.body),slackMessage(result.date));assert.equal(req.options.body.includes('alice'),false);assert.equal((await h.slack.status()).status,'sent');
});
test('other accounts, revoked permission, stale checks and disabled delivery send nothing',async()=>{
  const h=harness();await h.slack.configure({webhook:WEBHOOK,enabled:true});const alice=await digestAccount('alice');
  await h.slack.deliver({accountKey:await digestAccount('bob'),date:'2026-09-30'},{},async()=>{},()=>true);assert.equal((await h.slack.status()).status,'account-mismatch');
  h.permission=false;await h.slack.deliver({accountKey:alice,date:'2026-09-30'},{},async()=>{},()=>true);assert.equal((await h.slack.status()).status,'permission-required');
  h.permission=true;await h.slack.deliver({accountKey:alice,date:'2026-09-30'},{},async()=>{},()=>false);
  await h.slack.configure({enabled:false});await h.slack.deliver({accountKey:alice,date:'2026-09-30'},{},async()=>{},()=>true);assert.equal(h.calls.length,0);
});
test('uncertain and rejected sends stay generic and are not retried, including after adapter restart',async()=>{
  for(const fail of [true,false]){
    const h=harness();await h.slack.configure({webhook:WEBHOOK,enabled:true});h.fail=fail;h.status=403;const r={};const result={accountKey:await digestAccount('alice'),date:'2026-09-30'};
    await h.slack.deliver(result,r,async()=>{},()=>true);assert.equal((await h.slack.status()).status,fail?'uncertain':'failed');
    const restarted=new SlackDelivery({api:h.api,client:h.client,fetchFn:async()=>assert.fail('Must not retry')});await restarted.deliver(result,r,async()=>{},()=>true);
    assert.equal(JSON.stringify(await restarted.status()).includes('NotAReal'),false);
  }
});
test('invalid message dates never become Slack text',()=>{assert.throws(()=>slackMessage('2026-09-30 <!channel>'));assert.throws(()=>slackMessage(null));});
