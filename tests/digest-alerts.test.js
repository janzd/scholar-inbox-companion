import test from 'node:test';
import assert from 'node:assert/strict';
import {DigestAlerts,inspectDailyDigest,registerDigestAlerts,ALERT_ALARM,ALERT_NOTIFICATION,ALERT_PREFS,ALERT_STATE} from '../extension/digest-alerts.js';
import {digestAccount} from '../extension/digest-core.js';
const paper={paper_id:42,title:'Example',authors:'Author',cache_file_name:'Example.pdf'};
const DAY=86400000;
function harness(){
  let now=Date.parse('2026-09-30T12:00:00Z');const store={},events={};
  const h={requests:[],notifications:[],cleared:[],tabs:[],badge:'',alarm:null,permission:true,level:'granted',response:{username:'alice',digest_df:[paper],from_date:'2026-09-30',to_date:'2026-09-30',empty_digest:false},error:null};
  const event=name=>({addListener:fn=>{(events[name]??=[]).push(fn)}});
  h.api={storage:{local:{get:async()=>structuredClone(store),set:async values=>Object.assign(store,structuredClone(values))}},runtime:{getURL:p=>'chrome-extension://test/'+p,onStartup:event('startup'),onInstalled:event('installed')},alarms:{get:async()=>h.alarm,create:async(name,info)=>{h.alarm={name,...info}},clear:async()=>{h.alarm=null},onAlarm:event('alarm')},action:{setBadgeText:async({text})=>{h.badge=text},setBadgeBackgroundColor:async()=>{}},permissions:{contains:async()=>h.permission,onAdded:event('permission')},notifications:{getPermissionLevel:async()=>h.level,create:async(id,data)=>{if(h.notificationError)throw Error('Blocked');h.notifications.push({id,...data})},clear:async id=>h.cleared.push(id),onClicked:event('click')},tabs:{create:async data=>h.tabs.push(data)}};
  h.client={session:async()=>{if(h.error)throw h.error;},request:async path=>{h.requests.push(path);if(h.gate)await h.gate;return structuredClone(h.response)}};
  h.now=()=>now;h.advance=ms=>now+=ms;h.store=store;h.events=events;h.alerts=()=>new DigestAlerts({api:h.api,client:h.client,now:h.now});return h;
}

test('hourly alarms and badge work by default; worker initialization does not poll repeatedly',async()=>{
  const h=harness(),a=h.alerts();await a.initialize();
  assert.deepEqual(h.alarm,{name:ALERT_ALARM,delayInMinutes:60,periodInMinutes:60});assert.equal(h.badge,'NEW');assert.equal(h.notifications.length,0);
  await h.alerts().initialize();assert.equal(h.requests.length,1);
  h.alarm=null;await h.alerts().initialize();assert.equal(h.alarm.periodInMinutes,60);assert.equal(h.requests.length,1);
  h.advance(3600000);await a.check();assert.equal(h.requests.length,2);
  assert.equal(h.requests[0],'/');
});

test('availability requires dated personalized papers; empty, stale, undated and invalid records stay silent',async()=>{
  for(const change of [{digest_df:[]},{empty_digest:true},{from_date:'2026-09-29',to_date:'2026-09-29'},{from_date:undefined,to_date:undefined},{current_digest_date:'2026-09-29'},{digest_df:[{paper_id:42}]}]){
    const h=harness();Object.assign(h.response,change);const result=await inspectDailyDigest(h.client,h.now());assert.equal(result.ready,false);
  }
  const h=harness();h.response.username='';await assert.rejects(()=>inspectDailyDigest(h.client,h.now()),e=>e.code==='UNRECOGNIZED');
});

test('readiness follows Latest and resolves saved ranges to their final day',async()=>{
  const h=harness();
  h.response.current_digest_date='2026-09-30';
  h.response.from_date='2026-09-29';
  const result=await inspectDailyDigest(h.client,h.now());
  assert.equal(result.ready,true);
  assert.deepEqual(h.requests,['/','/?date=09-30-2026']);
  h.response.current_digest_date='2026-09-29';
  assert.equal((await inspectDailyDigest(h.client,h.now())).ready,false);
  h.response.current_digest_date='2026-10-01';
  assert.equal((await inspectDailyDigest(h.client,h.now())).ready,false);
});

test('one desktop alert per account and day persists across worker restarts, with no paper/account text stored',async()=>{
  const h=harness(),a=h.alerts();await a.configure({enabled:true,desktop:true});await a.check();
  await h.alerts().check(true);assert.equal(h.notifications.length,1);
  assert.equal(h.notifications[0].title,'Your Scholar Inbox digest is ready');
  h.advance(DAY);h.response.from_date=h.response.to_date='2026-10-01';await a.check();assert.equal(h.notifications.length,2);
  const stored=JSON.stringify(h.store);assert.equal(stored.includes('alice'),false);assert.equal(stored.includes('Example'),false);
  assert.equal(h.store[ALERT_STATE].accounts[0].notifiedDate,'2026-10-01');
});

test('viewing a digest clears its badge; old dates and other accounts do not clear a newer unread digest',async()=>{
  const h=harness(),a=h.alerts(),key=await digestAccount('alice');await a.check();
  await a.viewed({accountKey:key,date:'2026-09-29'});assert.equal(h.badge,'NEW');
  await a.viewed({accountKey:await digestAccount('bob'),date:'2026-09-30'});assert.equal(h.badge,'NEW');
  await a.viewed({accountKey:key,date:'2026-09-30'});assert.equal(h.badge,'');
  await a.configure({enabled:true,desktop:true});await a.check(true);assert.equal(h.notifications.length,0);
  for(const date of ['2026-10-01','invalid',null])await assert.rejects(()=>a.viewed({accountKey:key,date}));
});

test('reading before the first check suppresses that day’s alert',async()=>{
  const h=harness(),a=h.alerts();await a.viewed({accountKey:await digestAccount('alice'),date:'2026-09-30'});
  await a.configure({enabled:true,desktop:true});await a.check();assert.equal(h.badge,'');assert.equal(h.notifications.length,0);
});

test('disable invalidates a check in flight, clears alarm/badge, and performs no future checks',async()=>{
  const h=harness(),a=h.alerts();let release;h.gate=new Promise(r=>release=r);
  const check=a.check();while(!h.requests.length)await new Promise(r=>setImmediate(r));
  const disable=a.configure({enabled:false,desktop:false});release();await Promise.all([check,disable]);
  assert.equal(h.badge,'');assert.equal(h.alarm,null);assert.equal(h.notifications.length,0);
  await a.check(true);assert.equal(h.requests.length,1);
});

test('concurrent checks coalesce to a single request',async()=>{
  const h=harness(),a=h.alerts();await Promise.all([a.check(true),a.check(true),a.check()]);assert.equal(h.requests.length,1);
  await Promise.all([a.check(),a.check(true)]);assert.equal(h.requests.length,2,'A manual/alarm check takes priority over a concurrent startup throttle');
});

test('network errors remain quiet; logout clears stale indicators; accounts keep independent daily receipts',async()=>{
  const h=harness(),a=h.alerts();await a.configure({enabled:true,desktop:true});await a.check();
  h.error=Error('offline');await a.check(true);assert.equal(h.notifications.length,1);assert.equal(h.badge,'NEW');assert.equal((await a.status()).status,'offline');
  h.error=Object.assign(Error('logout'),{code:'AUTH_REQUIRED'});await a.check(true);assert.equal(h.badge,'');assert.equal((await a.status()).status,'signed-out');
  h.error=null;h.response.username='bob';await a.check(true);assert.equal(h.notifications.length,2);
  h.response.username='alice';await a.check(true);assert.equal(h.notifications.length,2);
});

test('notification failure preserves the badge and retries until delivery succeeds',async()=>{
  const h=harness(),a=h.alerts();h.permission=false;
  await assert.rejects(()=>a.configure({enabled:true,desktop:true}),/Allow notifications/);
  h.permission=true;await a.configure({enabled:true,desktop:true});h.level='denied';await a.check();
  assert.equal(h.badge,'NEW');assert.equal(h.notifications.length,0);assert.equal((await a.status()).status,'notification-blocked');
  h.level='granted';h.notificationError=true;await a.check(true);assert.equal(h.badge,'NEW');
  assert.equal((await a.status()).status,'notification-blocked');
  h.notificationError=false;await h.alerts().check(true);assert.equal(h.notifications.length,1);
  await h.alerts().check(true);assert.equal(h.notifications.length,1);
});

test('notification clicks open the announced date and retain the badge until successful reader acknowledgement',async()=>{
  const h=harness(),a=h.alerts();await a.check();await a.open();
  assert.equal(h.tabs[0].url,'chrome-extension://test/digest.html?date=2026-09-30');assert.equal(h.badge,'NEW');assert.equal(h.cleared.at(-1),ALERT_NOTIFICATION);
});

test('per-account receipts are bounded and feature preferences survive initialization',async()=>{
  const h=harness(),a=h.alerts();for(let i=0;i<8;i++){h.response.username='account-'+i;await a.check(true);}
  assert.equal(h.store[ALERT_STATE].accounts.length,5);
  await a.configure({enabled:false,desktop:false});await h.alerts().initialize();assert.deepEqual(h.store[ALERT_PREFS],{enabled:false,desktop:false});assert.equal(h.alarm,null);
});

test('event handlers restore hourly checks and register notification clicks after optional permission becomes available',async()=>{
  const h=harness();h.store[ALERT_PREFS]={enabled:false,desktop:false};const notifications=h.api.notifications;delete h.api.notifications;
  const a=registerDigestAlerts(h.api,h.client);await a.tail;
  assert.equal(h.events.startup.length,1);assert.equal(h.events.alarm.length,1);assert.equal(h.events.click,undefined);
  h.api.notifications=notifications;h.events.permission[0]();assert.equal(h.events.click.length,1);
  h.events.permission[0]();assert.equal(h.events.click.length,1);
  h.events.click[0](ALERT_NOTIFICATION);await a.tail;assert.equal(h.tabs.length,1);
});
