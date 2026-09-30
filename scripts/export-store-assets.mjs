import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium } from 'playwright';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const assets = path.join(root, 'assets/store');
const output = path.join(assets, 'exports');
await mkdir(output, { recursive: true });
const icon = await readFile(path.join(root, 'assets/branding/companion-icon.svg'), 'utf8');
const iconBody = icon.replace(/<svg[^>]*>/, '').replace('</svg>', '');
const promo = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
<rect width="440" height="280" fill="#223D8A"/>
<circle cx="-12" cy="-32" r="180" fill="#365CC7" opacity=".35"/>
<circle cx="471" cy="315" r="180" fill="#365CC7" opacity=".35"/>
<g transform="translate(156 26)">${iconBody}</g>
<g text-anchor="middle" font-family="Arial,Helvetica,sans-serif" fill="#FFF9EE">
<text x="220" y="193" font-size="25" font-weight="700" letter-spacing="-.6">Scholar Inbox Companion</text>
<text x="220" y="225" font-size="17">From paper to collection.</text>
<text x="220" y="257" font-size="11" fill="#C6D4F7">Unofficial companion for Scholar Inbox</text>
</g></svg>`;
await writeFile(path.join(assets, 'promo.svg'), promo);
await sharp(Buffer.from(promo)).flatten({ background: '#223D8A' }).removeAlpha().png().toFile(path.join(output, 'promo-440x280.png'));
await copyFile(path.join(root, 'extension/icons/store-128.png'), path.join(output, 'store-icon-128.png'));

const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.mjs':'text/javascript'};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith('/extension/') && !pathname.startsWith('/assets/store/')) { res.writeHead(404).end(); return; }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'}).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const qa = [];
try {
  // A fresh, temporary browser profile; never connects to an existing user profile.
  browser = await chromium.launch({headless:true, ...(process.env.STORE_ASSET_BROWSER_CHANNEL ? {channel:process.env.STORE_ASSET_BROWSER_CHANNEL} : {})});
  for (const [index, scene] of ['save','collect','settings'].entries()) {
    const context = await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
    const errors = [];
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/assets/store/scenes.html?scene=${scene}`);
    const ui = page.frames().find(frame => frame.url().startsWith(`${origin}/extension/`));
    if (!ui) throw new Error(`Missing UI frame: ${scene}`);
    await ui.waitForSelector(scene==='settings' ? '#palette' : '#collections .collection');
    if (scene !== 'settings') {
      if (scene==='collect') await ui.locator('#filter').fill('Diffusion');
      await ui.locator('input[name="collection"][value="sample-2"]').check();
      await ui.evaluate(() => document.activeElement?.blur());
    }
    const height = await ui.evaluate(() => Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, document.body.getBoundingClientRect().bottom)));
    const width = scene==='settings' ? 760 : 440;
    const scale = Math.min(1, 708/height, scene==='settings' ? 690/width : 1);
    await page.locator('#ui').evaluate((el,{height,scale}) => {el.style.height=`${height+2}px`;el.style.transform=`scale(${scale})`;}, {height,scale});
    await page.locator('.stage').evaluate((el,{height,scale})=>{el.style.top=`${Math.round((800-(height+2)*scale)/2)}px`;},{height,scale});
    await ui.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const checks = await ui.evaluate(() => ({mode:document.documentElement.dataset.theme,palette:document.documentElement.dataset.palette,overflow:document.body.scrollWidth>innerWidth,verticalOverflow:document.documentElement.scrollHeight>innerHeight+1,images:[...document.images].every(img=>img.complete&&img.naturalWidth>0)}));
    const bounds = await page.locator('#ui').boundingBox();
    if(errors.length || checks.overflow || checks.verticalOverflow || !checks.images || bounds.y<0 || bounds.y+bounds.height>800) throw new Error(JSON.stringify({scene,errors,checks,bounds}));
    const name=`screenshot-0${index+1}-${scene}-1280x800.png`;
    const screenshot=await page.screenshot({animations:'disabled'});
    await sharp(screenshot).flatten({background:'#ffffff'}).removeAlpha().png().toFile(path.join(output,name));
    qa.push({file:name,scene,...checks,uiScale:scale,errors});
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
for (const name of ['promo-440x280.png',...qa.map(item=>item.file)]) {
  const meta=await sharp(path.join(output,name)).metadata();
  if(meta.hasAlpha || meta.width!==(name.startsWith('promo')?440:1280) || meta.height!==(name.startsWith('promo')?280:800)) throw new Error(`Bad image: ${name}`);
}
await writeFile(path.join(assets,'capture-report.json'), JSON.stringify({browser:browser.version(),data:'Built-in local preview fixtures only; all external requests blocked.',screenshots:qa},null,2)+'\n');
console.log(`Exported promo tile, store icon, and ${qa.length} screenshots to ${output}`);
