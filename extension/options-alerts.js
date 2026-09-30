const enabled=document.getElementById('digest-checks');
const desktop=document.getElementById('digest-desktop');
const check=document.getElementById('digest-check-now');
const feedback=document.getElementById('digest-feedback');
const stateLabel=document.getElementById('digest-check-status');
const preview=!globalThis.chrome?.runtime?.id;
const messages={pending:'No checks yet.',available:'Today’s digest is available.',waiting:'Today’s digest is not available yet.', 'signed-out':'Sign in to Scholar Inbox in this Chrome profile. Checks will resume automatically.',unrecognized:'The digest account could not be identified. Open Scholar Inbox and try again.',offline:'The last check failed. We’ll try again at the next hourly check.','notification-blocked':'The badge is available, but desktop notifications could not be shown. Check Chrome and system notification settings.'};
let saved;
async function send(type,values){const reply=await chrome.runtime.sendMessage({type,values});if(!reply?.ok)throw new Error(reply?.error||'Reload the extension, then reopen Settings.');return reply.data;}
function busy(value){enabled.disabled=value;desktop.disabled=value||!enabled.checked;check.disabled=value||!enabled.checked;}
function render(data){saved=data;enabled.checked=data.enabled;desktop.checked=data.desktop&&data.permission;busy(false);stateLabel.textContent=data.enabled?(messages[data.status]||messages.pending)+(data.lastChecked?` Last checked: ${new Date(data.lastChecked).toLocaleString()}.`:''):'Hourly digest checks are off.';}
async function change(){
  const values={enabled:enabled.checked,desktop:desktop.checked};busy(true);feedback.textContent='Saving…';
  try{
    // Request optional permission directly in the user's click handler.
    if(values.enabled&&values.desktop&&!saved?.permission&&!await chrome.permissions.request({permissions:['notifications']}))throw new Error('Notification permission was not granted. The badge can still be used.');
    render(await send('digestAlertSettings',values));feedback.textContent='Saved. Digest checks run every 60 minutes while Chrome is running.';
  }catch(error){if(saved)render(saved);feedback.textContent=error.message;}
  finally{busy(false);}
}
enabled.addEventListener('change',change);desktop.addEventListener('change',change);
check.addEventListener('click',async()=>{busy(true);feedback.textContent='Checking today’s digest…';try{render(await send('digestAlertCheck'));feedback.textContent='Check complete.';}catch(error){feedback.textContent=error.message;}finally{busy(false);}});
if(preview){render({enabled:true,desktop:false,permission:false,status:'pending'});busy(true);feedback.textContent='Preview only. Open Settings in the installed extension to manage notifications.';}
else {busy(true);send('digestAlertStatus').then(render).catch(error=>{feedback.textContent=error.message;});}
