const mode=document.getElementById('discord-mode'),token=document.getElementById('discord-token'),user=document.getElementById('discord-user');
function fields(){document.getElementById('discord-dm-fields').hidden=mode.value!=='dm';document.getElementById('discord-webhook-fields').hidden=mode.value==='dm';}
mode.addEventListener('change',fields);
const form=document.getElementById('discord-form'),input=document.getElementById('discord-webhook'),toggle=document.getElementById('discord-enabled'),remove=document.getElementById('discord-remove'),feedback=document.getElementById('discord-feedback'),label=document.getElementById('discord-status');
const descriptions={'not-configured':'No Discord connection configured.',enabled:'Enabled for the Scholar Inbox account signed in when saved.',disabled:'Connection saved. Discord delivery is off.',sending:'Delivery was started. Check Discord before assuming it failed.',sent:'Last notification was accepted by Discord.',failed:'Discord rejected the last attempt. Check your Discord credentials, bot permissions or server settings or DM privacy settings; it will not be retried for that date.',uncertain:'Delivery could not be confirmed. Check Discord; it will not be retried for that date.','account-mismatch':'A different Scholar Inbox account is signed in. Save with delivery enabled to use this account.','permission-required':'Chrome permission for Discord is missing. Save with delivery enabled to allow it.'};
let saved;
function busy(value){for(const el of form.elements)el.disabled=value;if(!value)remove.disabled=!saved?.configured;}
function render(data){saved=data;mode.value=data.mode||'webhook';token.value='';user.value=data.userId||'';token.placeholder=data.configured&&data.mode==='dm'?'Token saved — leave blank to keep it':'Discord bot token';fields();toggle.checked=data.enabled;input.value='';input.placeholder=data.configured?'Webhook saved — leave blank to keep it':'https://discord.com/api/webhooks/…';label.textContent=(descriptions[data.status]||descriptions['not-configured'])+(data.lastAttempt?` Digest date: ${data.lastAttempt}.`:'');busy(false);}
async function send(type,values){const reply=await chrome.runtime.sendMessage({type,values});if(!reply?.ok)throw Error(reply?.error||'Reload the extension and reopen Settings.');return reply.data;}
form.addEventListener('submit',async event=>{
  event.preventDefault();const values={enabled:toggle.checked,mode:mode.value,webhook:input.value,token:token.value,userId:user.value};busy(true);feedback.textContent='Saving…';
  try{
    if(values.enabled&&!await chrome.permissions.request({origins:['https://discord.com/*']}))throw Error('Discord permission was not granted. Delivery remains unchanged.');
    render(await send('discordSettings',values));feedback.textContent=values.enabled?'Saved. Future hourly checks or Check now can send to your selected Discord destination.':'Saved. No Discord messages will be sent.';
  }catch(error){if(saved)render(saved);feedback.textContent=error.message;}finally{busy(false);}
});
remove.addEventListener('click',async()=>{busy(true);try{render(await send('discordSettings',{enabled:false,remove:true}));feedback.textContent='Connection removed and delivery disabled.';}catch(error){feedback.textContent=error.message;}finally{busy(false);}});
if(!globalThis.chrome?.runtime?.id){busy(true);label.textContent='Preview only. Configure Discord in the installed extension.';}
else{busy(true);send('discordStatus').then(render).catch(error=>{feedback.textContent=error.message;});}
