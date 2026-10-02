import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {digestPaper} from '../extension/digest-core.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../extension');
const raw=JSON.parse(await readFile(resolve(root,'digest-preview-data.json'),'utf8'));
const paper={...digestPaper(Array.isArray(raw)?raw[0]:raw),rating:0,relevanceScore:87};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root+'/'))throw new Error();
  res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const errors=[];let checks=0;
try{
  browser=await chromium.launch({headless:true,channel:process.env.DIGEST_TEST_BROWSER_CHANNEL||'chrome'});
  async function open(mode='normal',width=1280,theme='light',palette='blue'){
    const context=await browser.newContext({viewport:{width,height:1000}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="white"/><text x="60" y="200">Test figure</text></svg>'}));
    await context.addInitScript(({paper,mode,theme,palette})=>{
      localStorage.setItem('appearance',theme);localStorage.setItem('palette',palette);
      window.requests=[];window.testRating=0;
      if(mode==='hidden'){window.testVisibility='hidden';Object.defineProperty(document,'visibilityState',{get:()=>window.testVisibility});}
      window.activeDetails=0;window.maxDetails=0;
      const pause=ms=>new Promise(r=>setTimeout(r,ms));
      window.chrome={runtime:{id:'test-extension',sendMessage:async request=>{
        window.requests.push(request);
        if(request.type==='digestRating'){if(mode==='rating-error')return {ok:false,error:'Could not confirm. Refresh rating.',errorCode:'RATING_UNCERTAIN'};window.testRating=request.values.rating;return {ok:true,data:{rating:window.testRating}};}
        if(request.type==='digestRatingRead')return {ok:true,data:{rating:window.testRating}};
        if(request.type==='digestViewed')return{ok:true,data:{}};
        if(mode==='signed-out')return{ok:false,error:'Sign in to Scholar Inbox, then refresh.',errorCode:'AUTH_REQUIRED'};
        if(mode==='error')return{ok:false,error:'Could not load your digest.'};
        if(request.type==='digestDetail'){
          window.activeDetails++;window.maxDetails=Math.max(window.maxDetails,window.activeDetails);await pause(120);window.activeDetails--;
          return{ok:true,data:{...paper,paperId:request.paper.paperId,figures:mode==='missing'?[]:paper.figures,firstPage:null}};
        }
        if(mode==='stale'&&request.date==='2026-09-06')await pause(180);
        const entry={...paper,title:mode==='xss'?'<img src=x onerror="window.injected=true">':request.date||paper.title};
        if(mode==='negative')entry.relevanceScore=-85;
        if(mode==='zero')entry.relevanceScore=0;
        if(mode==='unscored')entry.relevanceScore=null;
        if(mode==='missing'||mode==='queue'){entry.figures=[];entry.firstPage=null;}
        let papers=mode==='empty'?[]:mode==='queue'?Array.from({length:6},(_,i)=>({...entry,paperId:paper.paperId+i})):request.page?[entry,{...entry,paperId:paper.paperId+1}]:[entry];
        return{ok:true,data:{accountKey:'a'.repeat(64),papers,date:request.date||'2026-09-07',page:request.page||0,skipped:0,hasMore:mode==='normal'&&!request.page,previousDate:'2026-09-06',nextDate:null}};
      }}};
    },{paper,mode,theme,palette});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/digest.html'+(mode==='dated'?'?date=2026-09-29':''));await page.waitForFunction(()=>document.querySelector('#papers').getAttribute('aria-busy')==='false');
    return{page,context};
  }
  const {page,context}=await open();
  assert.equal(await page.locator('.paper-card').count(),1);assert.equal(await page.locator('.abstract').textContent(),paper.abstract);
  assert.equal(await page.locator('.paper-links a').count(),2);checks+=3;
  await page.getByRole('button',{name:'Next figure',exact:true}).click();assert.match(await page.locator('.figure-controls span').textContent(),/2 \//);checks++;
  await page.getByRole('button',{name:'Enlarge figure',exact:true}).click();assert.equal(await page.locator('dialog').evaluate(e=>e.open),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(e=>e.open),false);checks+=2;
  await page.locator('#more').click();await page.waitForFunction(()=>document.querySelectorAll('.paper-card').length===2);assert.equal(await page.locator('#more').isVisible(),false);checks++;
  await context.close();
  for(const mode of ['empty','missing','error','signed-out','xss','stale','queue']){
    const {page,context}=await open(mode);
    if(mode==='empty')assert.equal(await page.locator('#empty').isVisible(),true);
    if(mode==='missing')await page.getByText('No figure is available for this paper.',{exact:true}).waitFor();
    if(mode==='error'||mode==='signed-out'){assert.equal(await page.locator('.paper-card').count(),0);assert.equal(await page.locator('#status').getAttribute('class'),'error');}
    if(mode==='xss'){assert.equal(await page.locator('.paper-card h2 img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);}
    if(mode==='stale'){
      await page.locator('#date').fill('2026-09-06');await page.locator('#date-form').evaluate(f=>f.requestSubmit());
      await page.locator('#date').fill('2026-09-05');await page.locator('#date-form').evaluate(f=>f.requestSubmit());
      await page.waitForFunction(()=>document.querySelector('.paper-card h2')?.textContent==='2026-09-05');
      await page.waitForFunction(()=>window.requests.some(r=>r.date==='2026-09-06'));
      await page.waitForTimeout(250);assert.equal(await page.locator('.paper-card h2').textContent(),'2026-09-05');
    }
    if(mode==='queue'){
      await page.evaluate(()=>document.querySelectorAll('.paper-card').forEach(c=>c.loadDetails()));
      await page.waitForFunction(()=>window.requests.filter(r=>r.type==='digestDetail').length===6&&window.activeDetails===0);
      assert.equal(await page.evaluate(()=>window.maxDetails),2);
    }
    checks++;await context.close();
  }
  for(const width of [390,1280])for(const theme of ['light','dark'])for(const palette of ['blue','scholar']){
    const {page,context}=await open('normal',width,theme,palette);
    assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
    assert.equal(await page.locator('html').getAttribute('data-palette'),palette);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks+=3;
    await context.close();
  }
  const dated=await open('dated');
  assert.equal(await dated.page.locator('#date').inputValue(),'2026-09-29');
  assert.equal(await dated.page.evaluate(()=>window.requests.find(r=>r.type==='digestViewed').values.date),'2026-09-29');
  await dated.context.close();
  const hidden=await open('hidden');
  assert.equal(await hidden.page.evaluate(()=>window.requests.some(r=>r.type==='digestViewed')),false);
  await hidden.page.evaluate(()=>{window.testVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await hidden.page.evaluate(()=>window.requests.filter(r=>r.type==='digestViewed').length),1);
  checks+=4;await hidden.context.close();
  for(const mode of ['normal','negative','zero','unscored']){
    const {page,context}=await open(mode);
    const badge=page.locator('.relevance-score');
    assert.equal(await badge.textContent(),{normal:'87',negative:'-85',zero:'0',unscored:'—'}[mode]);
    assert.equal(await badge.getAttribute('aria-label'),mode==='unscored'?'Relevance unavailable':`Relevance: ${{normal:87,negative:-85,zero:0}[mode]}`);
    assert.equal(await page.getByRole('button',{name:'Like',exact:true}).locator('svg').count(),1);
    assert.equal(await page.getByRole('button',{name:'Dislike',exact:true}).textContent(),'');
    if(mode!=='unscored'){
      const rgb=await badge.evaluate(e=>getComputedStyle(e).backgroundColor);
      assert.notEqual(rgb,'rgba(0, 0, 0, 0)');
    }
    checks+=4;await context.close();
  }
  const voting=await open();
  assert.equal(await voting.page.locator('.relevance-score').textContent(),'87');
  const like=voting.page.getByRole('button',{name:'Like',exact:true}),dislike=voting.page.getByRole('button',{name:'Dislike',exact:true});
  await like.click();await voting.page.waitForFunction(()=>document.querySelector('.rating-status').textContent==='Liked');assert.equal(await like.getAttribute('aria-pressed'),'true');
  await like.click();await voting.page.waitForFunction(()=>document.querySelector('.rating-status').textContent==='No rating');assert.equal(await like.getAttribute('aria-pressed'),'false');
  await dislike.click();await voting.page.waitForFunction(()=>document.querySelector('.rating-status').textContent==='Disliked');assert.equal(await dislike.getAttribute('aria-pressed'),'true');
  await voting.context.close();
  const failedVote=await open('rating-error');await failedVote.page.getByRole('button',{name:'Like',exact:true}).click();
  await failedVote.page.getByText('Could not confirm. Refresh rating.',{exact:true}).waitFor();
  assert.equal(await failedVote.page.getByRole('button',{name:'Like',exact:true}).isDisabled(),true);
  assert.equal(await failedVote.page.getByRole('button',{name:'Like',exact:true}).getAttribute('aria-pressed'),'false');
  await failedVote.page.getByRole('button',{name:'Refresh rating',exact:true}).click();await failedVote.page.waitForFunction(()=>document.querySelector('.rating-status').textContent==='No rating');
  assert.equal(await failedVote.page.evaluate(()=>window.requests.filter(r=>r.type==='digestRating').length),1);
  assert.equal(await failedVote.page.getByRole('button',{name:'Like',exact:true}).isEnabled(),true);
  checks+=8;await failedVote.context.close();
  const broken=await open();
  await broken.context.route('https://www.scholar-inbox.com/**',route=>route.abort());
  await broken.page.reload();await broken.page.getByText('This image could not be loaded. Try another figure or open the paper.',{exact:true}).waitFor();checks++;
  await broken.context.close();
  assert.deepEqual(errors,[]);
  if(process.env.DIGEST_SCREENSHOT_DIR){
    await mkdir(process.env.DIGEST_SCREENSHOT_DIR,{recursive:true});
    const context=await browser.newContext({viewport:{width:1280,height:1100}});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      return url.origin===origin||(url.origin==='https://www.scholar-inbox.com'&&/^\/(teaser_figures|first_pages)\//.test(url.pathname))?route.continue():route.abort();
    });
    for(const theme of ['light','dark']){
      const page=await context.newPage();await page.addInitScript(theme=>localStorage.setItem('appearance',theme),theme);
      await page.goto(origin+'/digest.html?preview=1');await page.locator('.paper-card').waitFor();
      await page.waitForFunction(()=>[...document.querySelectorAll('.figure-open img')].every(i=>i.complete&&i.naturalWidth>0));
      await page.screenshot({path:resolve(process.env.DIGEST_SCREENSHOT_DIR,`reader-${theme}.png`),fullPage:true});await page.close();
    }await context.close();
  }
  console.log(`Digest browser checks passed: ${checks}; no uncaught page errors.`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
