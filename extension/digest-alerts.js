import {digestDate,digestQuery,digestAccount,normalizeDigest} from './digest-core.js';
export const ALERT_ALARM='digest-hourly', ALERT_NOTIFICATION='digest-ready';
export const ALERT_PREFS='digestAlertPreferencesV1', ALERT_STATE='digestAlertStateV1';
const HOUR=60*60*1000;
const freshState=()=>({accounts:[],currentAccount:null,lastAttempt:0,lastChecked:0,status:'pending'});
const validKey=key=>typeof key==='string'&&/^[a-f0-9]{64}$/.test(key);

// A date echo alone is insufficient: require an explicitly dated, non-empty
// personalized response. No completion/email-delivery flag is exposed by the site.
export async function inspectDailyDigest(client, now) {
  const today=new Date(now).toISOString().slice(0,10);
  await client.session();
  let raw=await client.request(digestQuery());
  // Follow the reader's Latest selection, including a saved range's final day.
  const from=digestDate(raw.from_date),to=digestDate(raw.to_date);
  if(from&&to&&from!==to)raw=await client.request(digestQuery({date:to}));
  const accountKey=await digestAccount(raw.username);
  if(!accountKey)throw Object.assign(new Error('The digest account could not be identified.'),{code:'UNRECOGNIZED'});
  const data=normalizeDigest(raw);
  return {accountKey,date:today,ready:data.date===today&&raw.empty_digest!==true&&data.papers.length>0};
}

export class DigestAlerts {
  constructor({api,client,now=Date.now}){this.api=api;this.client=client;this.now=now;this.tail=Promise.resolve();this.epoch=0;}
  serial(fn){const task=this.tail.then(fn);this.tail=task.catch(()=>{});return task;}
  async read(){
    const stored=await this.api.storage.local.get([ALERT_PREFS,ALERT_STATE]);
    const pref=stored[ALERT_PREFS]||{};
    const state={...freshState(),...stored[ALERT_STATE]};
    state.accounts=(Array.isArray(state.accounts)?state.accounts:[]).filter(a=>validKey(a.key)).slice(-5);
    return {prefs:{enabled:pref.enabled!==false,desktop:pref.desktop===true},state};
  }
  save(state){return this.api.storage.local.set({[ALERT_STATE]:state});}
  account(state,key){
    let record=state.accounts.find(a=>a.key===key);
    if(!record){record={key,seenDate:null,notifiedDate:null,unreadDate:null};state.accounts.push(record);state.accounts=state.accounts.slice(-5);}
    return record;
  }
  async clearNotification(){try{await this.api.notifications?.clear(ALERT_NOTIFICATION);}catch{/* Permission may have been revoked. */}}
  async badge(prefs,state){
    const record=state.accounts.find(a=>a.key===state.currentAccount);
    await this.api.action.setBadgeBackgroundColor({color:'#365cc7'});
    await this.api.action.setBadgeText({text:prefs.enabled&&record?.unreadDate?'NEW':''});
  }
  async schedule(prefs){
    if(!prefs.enabled){await this.api.alarms.clear(ALERT_ALARM);return;}
    const alarm=await this.api.alarms.get(ALERT_ALARM);
    if(!alarm||alarm.periodInMinutes!==60)await this.api.alarms.create(ALERT_ALARM,{delayInMinutes:60,periodInMinutes:60});
  }
  initialize(force=false){return this.serial(async()=>{const {prefs,state}=await this.read();await this.schedule(prefs);await this.badge(prefs,state);}).then(()=>this.check(force));}
  async status(){const {prefs,state}=await this.read();return {...prefs,lastChecked:state.lastChecked,status:state.status,permission:await this.api.permissions.contains({permissions:['notifications']})};}
  configure(values){
    if(typeof values?.enabled!=='boolean'||typeof values?.desktop!=='boolean')return Promise.reject(new Error('Invalid notification settings.'));
    this.epoch++; // Discard a poll already in flight before changing settings.
    return this.serial(async()=>{
      const desktop=values.desktop&&await this.api.permissions.contains({permissions:['notifications']});
      if(values.desktop&&!desktop)throw new Error('Allow notifications in Chrome first.');
      const prefs={enabled:values.enabled,desktop};
      await this.api.storage.local.set({[ALERT_PREFS]:prefs});
      await this.schedule(prefs);
      if(!prefs.enabled||!prefs.desktop)await this.clearNotification();
      const {state}=await this.read();await this.badge(prefs,state);
      return this.status();
    });
  }
  check(force=false){
    const epoch=this.epoch;
    if(this.pendingCheck?.epoch===epoch){this.pendingCheck.force ||= force;return this.pendingCheck.promise;}
    const pending={epoch,force,promise:null};
    const promise=this.serial(async()=>{
      const {prefs,state}=await this.read();const now=this.now();
      if(epoch!==this.epoch||!prefs.enabled||(!pending.force&&state.lastAttempt&&now>=state.lastAttempt&&now-state.lastAttempt<HOUR))return;
      state.lastAttempt=now;await this.save(state);
      let result;
      try{result=await inspectDailyDigest(this.client,now);}
      catch(error){
        if(epoch!==this.epoch)return;
        state.lastChecked=now;state.status=error.code==='AUTH_REQUIRED'?'signed-out':error.code==='UNRECOGNIZED'?'unrecognized':'offline';
        if(['signed-out','unrecognized'].includes(state.status)){state.currentAccount=null;await this.clearNotification();}
        await this.save(state);await this.badge(prefs,state);return;
      }
      if(epoch!==this.epoch)return;
      if(state.currentAccount!==result.accountKey)await this.clearNotification();
      state.currentAccount=result.accountKey;state.lastChecked=now;state.status=result.ready?'available':'waiting';
      const record=this.account(state,result.accountKey);
      if(result.ready&&(!record.seenDate||record.seenDate<result.date)){
        record.unreadDate=result.date;
        if(prefs.desktop&&(!record.notifiedDate||record.notifiedDate<result.date)){
          let allowed=false;
          try{allowed=await this.api.permissions.contains({permissions:['notifications']})&&await this.api.notifications.getPermissionLevel()==='granted';}catch{/* Badge still works. */}
          if(epoch!==this.epoch)return;
          if(allowed){
            // Persist before displaying to avoid repeat alerts after worker restarts.
            const previousNotifiedDate=record.notifiedDate;
            record.notifiedDate=result.date;await this.save(state);
            try{await this.api.notifications.create(ALERT_NOTIFICATION,{type:'basic',iconUrl:this.api.runtime.getURL('icons/icon-128.png'),title:'Your Scholar Inbox digest is ready',message:`New papers for ${result.date}. Click to open your digest.`});}
            catch{record.notifiedDate=previousNotifiedDate;state.status='notification-blocked';}
          }else state.status='notification-blocked';
        }
      }
      await this.save(state);await this.badge(prefs,state);
    });
    pending.promise=promise;this.pendingCheck=pending;
    promise.finally(()=>{if(this.pendingCheck===pending)this.pendingCheck=null;}).catch(()=>{});
    return promise;
  }
  viewed({accountKey,date}={}){
    if(!validKey(accountKey)||typeof date!=='string'||digestDate(date)!==date||date>new Date(this.now()).toISOString().slice(0,10))return Promise.reject(new Error('Invalid digest receipt.'));
    return this.serial(async()=>{
      const {prefs,state}=await this.read();const record=this.account(state,accountKey);
      if(!record.seenDate||record.seenDate<date)record.seenDate=date;
      if(record.unreadDate&&record.unreadDate<=date){record.unreadDate=null;if(state.currentAccount===accountKey)await this.clearNotification();}
      await this.save(state);await this.badge(prefs,state);
    });
  }
  open(){return this.serial(async()=>{
    const {state}=await this.read();const record=state.accounts.find(a=>a.key===state.currentAccount);
    const date=digestDate(record?.unreadDate);
    await this.api.tabs.create({url:this.api.runtime.getURL(`digest.html${date?'?date='+date:''}`)});
    await this.clearNotification(); // Badge clears only after the reader actually displays this date.
  });}
}

export function registerDigestAlerts(api,client){
  const alerts=new DigestAlerts({api,client});
  const quiet=promise=>promise.catch(()=>{});
  api.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALERT_ALARM)quiet(alerts.check(true));});
  api.runtime.onStartup.addListener(()=>quiet(alerts.initialize(true)));
  api.runtime.onInstalled.addListener(()=>quiet(alerts.initialize()));
  let clickRegistered=false;
  const registerClick=()=>{if(!clickRegistered&&api.notifications?.onClicked){api.notifications.onClicked.addListener(id=>{if(id===ALERT_NOTIFICATION)quiet(alerts.open());});clickRegistered=true;}};
  registerClick();
  api.permissions.onAdded.addListener(registerClick);
  quiet(alerts.initialize()); // Repair missing alarms whenever the worker starts.
  return alerts;
}
