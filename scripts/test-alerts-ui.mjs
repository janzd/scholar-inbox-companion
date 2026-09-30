import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../extension');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',types[extname(path)]||'text/plain');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;let count=0;const errors=[];
try{
  browser=await chromium.launch({headless:true,channel:process.env.DIGEST_TEST_BROWSER_CHANNEL||'chrome'});
  for(const theme of ['light','dark'])for(const palette of ['blue','scholar']){
    const context=await browser.newContext({viewport:{width:390,height:1000}});
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    await context.addInitScript(({theme,palette})=>{
      localStorage.setItem('appearance',theme);localStorage.setItem('palette',palette);
      window.slack={configured:false,enabled:false,status:'not-configured'};
      window.pref={enabled:true,desktop:false,permission:false,status:'pending',lastChecked:0};window.deny=false;window.requested=0;window.messages=[];
      window.chrome={runtime:{id:'test',sendMessage:async({type,values})=>{window.messages.push({type,values});if(type==='slackStatus')return{ok:true,data:{...window.slack}};if(type==='slackSettings'){window.slack=values.remove?{configured:false,enabled:false,status:'not-configured'}:{configured:true,enabled:values.enabled,status:values.enabled?'enabled':'disabled'};return{ok:true,data:{...window.slack}};}if(type==='digestAlertSettings')Object.assign(window.pref,values);if(type==='digestAlertCheck'){window.pref.status='waiting';window.pref.lastChecked=Date.now();}return{ok:true,data:{...window.pref}};}},permissions:{request:async()=>{window.requested++;window.pref.permission=!window.deny;return !window.deny;}}};
    },{theme,palette});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/options.html');
    await page.waitForFunction(()=>!document.querySelector('#digest-checks').disabled);
    assert.equal(await page.locator('#digest-checks').isChecked(),true);assert.equal(await page.locator('#digest-desktop').isChecked(),false);
    await page.locator('#digest-desktop').check();await page.waitForFunction(()=>document.querySelector('#digest-feedback').textContent.startsWith('Saved.'));
    assert.equal(await page.evaluate(()=>window.requested),1);assert.equal(await page.locator('#digest-desktop').isChecked(),true);
    await page.locator('#digest-checks').uncheck();await page.waitForFunction(()=>!document.querySelector('#digest-checks').disabled);
    assert.equal(await page.locator('#digest-desktop').isDisabled(),true);assert.equal(await page.locator('#digest-check-now').isDisabled(),true);
    await page.locator('#digest-checks').check();await page.waitForFunction(()=>!document.querySelector('#digest-check-now').disabled);
    await page.locator('#digest-check-now').click();await page.getByText('Check complete.',{exact:true}).waitFor();assert.match(await page.locator('#digest-check-status').textContent(),/not available yet/);
    await page.locator('#digest-desktop').uncheck();await page.waitForFunction(()=>!document.querySelector('#digest-checks').disabled);
    // Simulate a revoked permission after reopening Settings, then a denied request.
    await page.evaluate(()=>{window.deny=true;window.pref.permission=false;});
    await page.goto(origin+'/options.html');await page.waitForFunction(()=>!document.querySelector('#digest-checks').disabled);
    await page.evaluate(()=>{window.deny=true;});await page.locator('#digest-desktop').click();await page.getByText(/Notification permission was not granted/).waitFor();
    assert.equal(await page.locator('#digest-desktop').isChecked(),false);assert.equal(await page.locator('#digest-checks').isChecked(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert.equal(await page.locator('html').getAttribute('data-palette'),palette);count+=12;
    await page.locator('#slack-webhook').fill('https://hooks.slack.com/services/DEMO_WORKSPACE/DEMO_CHANNEL/NotARealWebhookToken0000');
    await page.getByRole('button',{name:'Save Slack settings',exact:true}).click();
    await page.getByText('Saved. No Slack messages will be sent.',{exact:true}).waitFor();
    assert.equal(await page.locator('#slack-webhook').inputValue(),'');assert.equal(await page.locator('#slack-enabled').isChecked(),false);
    await page.evaluate(()=>{window.deny=false;});await page.locator('#slack-enabled').check();
    await page.getByRole('button',{name:'Save Slack settings',exact:true}).click();await page.getByText(/Future hourly checks or Check now can post/).waitFor();
    assert.equal(await page.locator('#slack-enabled').isChecked(),true);
    await page.locator('#slack-remove').click();await page.getByText('Webhook removed and delivery disabled.',{exact:true}).waitFor();
    assert.equal(await page.locator('#slack-enabled').isChecked(),false);assert.equal(await page.locator('#slack-remove').isDisabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);count+=6;
    if(process.env.ALERTS_SCREENSHOT_DIR&&palette==='blue'){
      await mkdir(process.env.ALERTS_SCREENSHOT_DIR,{recursive:true});await page.setViewportSize({width:960,height:1200});
      await page.evaluate(()=>{window.deny=false;});
      await page.locator('#digest-desktop').check();await page.waitForFunction(()=>!document.querySelector('#digest-check-now').disabled);
      await page.locator('#digest-check-now').click();await page.getByText('Check complete.',{exact:true}).waitFor();
      await page.evaluate(async()=>{scrollTo(0,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      // Screenshot the real Settings UI with explicitly mocked extension APIs.
      await page.screenshot({path:resolve(process.env.ALERTS_SCREENSHOT_DIR,`settings-${theme}.png`),fullPage:true});
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log(`Notification Settings browser checks passed: ${count}; no uncaught page errors.`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
