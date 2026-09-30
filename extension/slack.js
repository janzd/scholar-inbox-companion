import {digestAccount,digestDate} from './digest-core.js';
export const SLACK_CONFIG='slackDeliveryV1';
export const SLACK_ORIGIN='https://hooks.slack.com/*';
export function webhookUrl(value){
  try{const u=new URL(String(value).trim());return u.protocol==='https:'&&u.hostname==='hooks.slack.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/services\/[A-Za-z0-9_-]{3,100}\/[A-Za-z0-9_-]{3,100}\/[A-Za-z0-9_-]{10,200}$/.test(u.pathname)?u.href:null;}catch{return null;}
}
export function slackMessage(date){
  if(typeof date!=='string'||digestDate(date)!==date)throw Error('Invalid digest date.');
  return {text:`Your Scholar Inbox digest for ${date} is ready.\n<https://www.scholar-inbox.com/digest|Open Scholar Inbox> or choose Your digest in the Companion extension.`,unfurl_links:false,unfurl_media:false};
}
export class SlackDelivery {
  constructor({api,client,fetchFn=globalThis.fetch.bind(globalThis)}){
    this.api=api;this.client=client;this.fetch=fetchFn;
    // Keep the bearer-like webhook secret unavailable to content scripts.
    this.ready=Promise.resolve(api.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'}));
    this.ready.catch(()=>{});
  }
  async config(){await this.ready;return (await this.api.storage.local.get(SLACK_CONFIG))[SLACK_CONFIG]||{};}
  async status(){const c=await this.config();return {configured:!!webhookUrl(c.webhook),enabled:c.enabled===true,status:c.status||'not-configured',lastAttempt:c.lastAttempt||null};}
  async configure(values){
    if(typeof values?.enabled!=='boolean')throw Error('Invalid Slack settings.');
    const old=await this.config();
    if(values.remove===true){await this.api.storage.local.remove(SLACK_CONFIG);return this.status();}
    if(values.webhook!==undefined&&typeof values.webhook!=='string')throw Error('Enter a valid Slack incoming webhook URL.');
    const url=values.webhook?.trim()?webhookUrl(values.webhook):webhookUrl(old.webhook);
    if(!url)throw Error('Enter a valid https://hooks.slack.com/services/… webhook URL.');
    let accountKey=old.accountKey;
    if(values.enabled){
      if(!await this.api.permissions.contains({origins:[SLACK_ORIGIN]}))throw Error('Allow access to Slack webhooks in Chrome first.');
      await this.client.session();accountKey=await digestAccount((await this.client.request('/')).username);
      if(!accountKey)throw Error('Sign in to Scholar Inbox before enabling Slack delivery.');
    }
    await this.api.storage.local.set({[SLACK_CONFIG]:{webhook:url,enabled:values.enabled,accountKey,status:values.enabled?'enabled':'disabled',lastAttempt:old.lastAttempt||null}});
    return this.status(); // Never return the saved secret to the page.
  }
  async deliver(result,record,persist,isCurrent){
    const c=await this.config();
    if(!c.enabled||!webhookUrl(c.webhook)||!isCurrent())return;
    if(c.accountKey!==result.accountKey){await this.note(c,'account-mismatch');return;}
    if(record.slackAttemptedDate&&record.slackAttemptedDate>=result.date)return;
    if(!await this.api.permissions.contains({origins:[SLACK_ORIGIN]})){await this.note(c,'permission-required');return;}
    if(!isCurrent())return;
    record.slackAttemptedDate=result.date;
    await persist(); // At most one attempt per account/date, even after an uncertain result.
    if(!isCurrent())return;
    await this.note(c,'sending',result.date);
    try{
      const response=await this.fetch(c.webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(slackMessage(result.date)),credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
      const text=response.ok?await response.text():'';
      await this.note(c,response.ok&&text.trim()==='ok'?'sent':'failed',result.date);
    }catch{await this.note(c,'uncertain',result.date);}
    // No raw URL, response body, account identifier, or error text is logged/exposed.
  }
  async note(config,status,date=config.lastAttempt||null){await this.api.storage.local.set({[SLACK_CONFIG]:{...config,status,lastAttempt:date}});}
}
