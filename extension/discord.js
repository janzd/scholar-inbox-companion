import {digestAccount,digestDate} from './digest-core.js';
export const DISCORD_CONFIG='discordDeliveryV1';
export const DISCORD_ORIGIN='https://discord.com/*';
const botToken=value=>typeof value==='string'&&/^[A-Za-z0-9_.-]{30,300}$/.test(value.trim())?value.trim():null;
const userId=value=>typeof value==='string'&&/^[0-9]{17,20}$/.test(value)?value:null;
const configured=c=>c.mode==='dm'?!!(botToken(c.token)&&userId(c.userId)):!!webhookUrl(c.webhook);

export function webhookUrl(value){
  try{const u=new URL(String(value).trim());return u.protocol==='https:'&&u.hostname==='discord.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/api\/(?:v10\/)?webhooks\/[0-9]{17,20}\/[A-Za-z0-9_-]{20,200}$/.test(u.pathname)?u.href:null;}catch{return null;}
}
export function discordMessage(date){
  if(typeof date!=='string'||digestDate(date)!==date)throw Error('Invalid digest date.');
  return {content:`Your Scholar Inbox digest for ${date} is ready.\n<https://www.scholar-inbox.com/digest> or choose Your digest in the Companion extension.`,allowed_mentions:{parse:[]},flags:4};
}
export class DiscordDelivery {
  constructor({api,client,fetchFn=globalThis.fetch.bind(globalThis)}){
    this.api=api;this.client=client;this.fetch=fetchFn;
    // Keep the bearer-like webhook secret unavailable to content scripts.
    this.ready=Promise.resolve(api.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'}));
    this.ready.catch(()=>{});
  }
  async config(){await this.ready;return (await this.api.storage.local.get(DISCORD_CONFIG))[DISCORD_CONFIG]||{};}
  async status(){const c=await this.config();return {configured:configured(c),mode:c.mode||'webhook',userId:c.userId||'',enabled:c.enabled===true,status:c.status||'not-configured',lastAttempt:c.lastAttempt||null};}
  async configure(values){
    if(typeof values?.enabled!=='boolean')throw Error('Invalid Discord settings.');
    const old=await this.config();
    if(values.remove===true){await this.api.storage.local.remove(DISCORD_CONFIG);return this.status();}
    const mode=values.mode??old.mode??'webhook';
    if(!['dm','webhook'].includes(mode))throw Error('Choose a Discord delivery method.');
    for(const key of ['webhook','token','userId'])if(values[key]!==undefined&&typeof values[key]!=='string')throw Error('Invalid Discord settings.');
    const connection=mode==='dm'?{mode,token:botToken(values.token?.trim()|| (old.mode==='dm'?old.token:'')),userId:userId((values.userId??old.userId??'').trim())}:{mode,webhook:webhookUrl(values.webhook?.trim()||old.webhook)};
    if(!configured(connection))throw Error(mode==='dm'?'Enter a Discord bot token and your numeric user ID.':'Enter a valid https://discord.com/api/webhooks/… webhook URL.');
    let accountKey=old.accountKey;
    if(values.enabled){
      if(!await this.api.permissions.contains({origins:[DISCORD_ORIGIN]}))throw Error('Allow access to Discord in Chrome first.');
      await this.client.session();accountKey=await digestAccount((await this.client.request('/')).username);
      if(!accountKey)throw Error('Sign in to Scholar Inbox before enabling Discord delivery.');
    }
    await this.api.storage.local.set({[DISCORD_CONFIG]:{...connection,enabled:values.enabled,accountKey,status:values.enabled?'enabled':'disabled',lastAttempt:old.lastAttempt||null}});
    return this.status(); // Never return the saved secret to the page.
  }
  async deliver(result,record,persist,isCurrent){
    const c=await this.config();
    if(!c.enabled||!configured(c)||!isCurrent())return;
    if(c.accountKey!==result.accountKey){await this.note(c,'account-mismatch');return;}
    if(record.discordAttemptedDate&&record.discordAttemptedDate>=result.date)return;
    if(!await this.api.permissions.contains({origins:[DISCORD_ORIGIN]})){await this.note(c,'permission-required');return;}
    if(!isCurrent())return;
    record.discordAttemptedDate=result.date;
    await persist(); // At most one attempt per account/date, even after an uncertain result.
    if(!isCurrent())return;
    await this.note(c,'sending',result.date);
    try{
      const message=discordMessage(result.date);
      if(c.mode==='dm'){
        const opened=await this.callBot(c,'users/@me/channels',{recipient_id:c.userId});
        if(!opened.ok||opened.data?.type!==1||!userId(opened.data?.id)){await this.note(c,'failed',result.date);return;}
        if(!isCurrent())return;
        const posted=await this.callBot(c,`channels/${opened.data.id}/messages`,message);
        await this.note(c,posted.ok&&userId(posted.data?.id)?'sent':'failed',result.date);
      }else{
        const response=await this.fetch(c.webhook+'?wait=true',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message),credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
        const data=response.ok?await response.json():null;
        await this.note(c,response.ok&&userId(data?.id)?'sent':'failed',result.date);
      }
    }catch{await this.note(c,'uncertain',result.date);}
    // No raw URL, response body, account identifier, or error text is logged/exposed.
  }
  async callBot(config,method,body){
    const response=await this.fetch(`https://discord.com/api/v10/${method}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bot ${config.token}`},body:JSON.stringify(body),credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
    return response.ok?{ok:true,data:await response.json()}:{ok:false};
  }
  async note(config,status,date=config.lastAttempt||null){await this.api.storage.local.set({[DISCORD_CONFIG]:{...config,status,lastAttempt:date}});}
}
