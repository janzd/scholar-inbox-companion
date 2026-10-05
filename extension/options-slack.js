const mode=document.getElementById('slack-mode'),token=document.getElementById('slack-token'),user=document.getElementById('slack-user');
function fields(){document.getElementById('slack-dm-fields').hidden=mode.value!=='dm';document.getElementById('slack-webhook-fields').hidden=mode.value==='dm';}
mode.addEventListener('change',fields);
const form=document.getElementById('slack-form'),input=document.getElementById('slack-webhook'),toggle=document.getElementById('slack-enabled'),remove=document.getElementById('slack-remove'),feedback=document.getElementById('slack-feedback'),label=document.getElementById('slack-status');
const descriptions={'not-configured':'No Slack connection configured.',enabled:'Enabled for the Scholar Inbox account signed in when saved.',disabled:'Connection saved. Slack delivery is off.',sending:'Delivery was started. Check Slack before assuming it failed.',sent:'Last notification was accepted by Slack.',failed:'Slack rejected the last attempt. Check your Slack credentials, bot permissions or workspace policy; it will not be retried for that date.',uncertain:'Delivery could not be confirmed. Check Slack; it will not be retried for that date.','account-mismatch':'A different Scholar Inbox account is signed in. Save with delivery enabled to use this account.','permission-required':'Chrome permission for Slack is missing. Save with delivery enabled to allow it.'};
let saved;
function busy(value){for(const el of form.elements)el.disabled=value;if(!value)remove.disabled=!saved?.configured;}
function render(data){saved=data;mode.value=data.mode||'webhook';token.value='';user.value=data.userId||'';token.placeholder=data.configured&&data.mode==='dm'?'Token saved — leave blank to keep it':'xoxb-…';fields();toggle.checked=data.enabled;input.value='';input.placeholder=data.configured?'Webhook saved — leave blank to keep it':'https://hooks.slack.com/services/…';label.textContent=(descriptions[data.status]||descriptions['not-configured'])+(data.lastAttempt?` Digest date: ${data.lastAttempt}.`:'');busy(false);}
async function send(type,values){const reply=await chrome.runtime.sendMessage({type,values});if(!reply?.ok)throw Error(reply?.error||'Reload the extension and reopen Settings.');return reply.data;}
form.addEventListener('submit',async event=>{
  event.preventDefault();const values={enabled:toggle.checked,mode:mode.value,webhook:input.value,token:token.value,userId:user.value};busy(true);feedback.textContent='Saving…';
  try{
    if(values.enabled&&!await chrome.permissions.request({origins:[values.mode==='dm'?'https://slack.com/*':'https://hooks.slack.com/*']}))throw Error('Slack permission was not granted. Delivery remains unchanged.');
    render(await send('slackSettings',values));feedback.textContent=values.enabled?'Saved. Future hourly checks or Check now can send to your selected Slack destination.':'Saved. No Slack messages will be sent.';
  }catch(error){if(saved)render(saved);feedback.textContent=error.message;}finally{busy(false);}
});
remove.addEventListener('click',async()=>{busy(true);try{render(await send('slackSettings',{enabled:false,remove:true}));feedback.textContent='Connection removed and delivery disabled.';}catch(error){feedback.textContent=error.message;}finally{busy(false);}});
if(!globalThis.chrome?.runtime?.id){busy(true);label.textContent='Preview only. Configure Slack in the installed extension.';}
else{busy(true);send('slackStatus').then(render).catch(error=>{feedback.textContent=error.message;});}
