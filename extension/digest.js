const $ = id => document.getElementById(id);
const preview = !globalThis.chrome?.runtime?.id && new URLSearchParams(location.search).has('preview');
let generation = 0, currentDate = null, currentPage = 0, currentData = null, knownIds = new Set();
let detailsActive = 0, detailsQueue = [];
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); entry.target.loadDetails?.(); }
}, {rootMargin:'240px'});

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function external(text, url) {
  const a = element('a', '', text); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function clearPapers() {
  observer.disconnect(); detailsQueue = []; knownIds = new Set(); $('papers').replaceChildren(); $('count').textContent = '';
  $('empty').hidden = true; $('more').hidden = true;
  if ($('figure-dialog').open) $('figure-dialog').close();
}
async function send(type, payload = {}) {
  if (preview) {
    const {previewDigest} = await import('./digest-preview.js');
    return previewDigest(type, payload, new URLSearchParams(location.search).get('view'));
  }
  if (!globalThis.chrome?.runtime?.id) throw new Error('Open this reader from the installed Scholar Inbox Companion extension.');
  const reply = await chrome.runtime.sendMessage({type, ...payload});
  if (!reply?.ok) throw Object.assign(new Error(reply?.error || 'Could not contact the extension. Reload it in Chrome, then retry.'), {code:reply?.errorCode});
  return reply.data;
}
function signedOut(error) {
  generation++; clearPapers(); $('papers').setAttribute('aria-busy','false'); $('refresh').disabled = false;
  $('previous').disabled = $('next').disabled = true; status(error.message, true);
}
function pumpDetails() {
  while (detailsActive < 2 && detailsQueue.length) {
    const job = detailsQueue.shift();
    if (job.token !== generation || !job.card.isConnected) continue;
    detailsActive++;
    job.run().finally(() => { detailsActive--; pumpDetails(); });
  }
}
function showFigure(visual, paper) {
  visual.replaceChildren();
  const figures = paper.figures.length ? paper.figures : paper.firstPage ? [paper.firstPage] : [];
  if (!figures.length) { visual.append(element('div','figure-placeholder','No figure is available for this paper.')); return; }
  let index = 0;
  const open = element('button','figure-open'); open.type = 'button'; open.setAttribute('aria-label','Enlarge figure');
  const image = element('img'); image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; open.append(image);
  const controls = element('div','figure-controls'); const label = element('span');
  const back = element('button','','←'); back.type = 'button'; back.setAttribute('aria-label','Previous figure');
  const forward = element('button','','→'); forward.type = 'button'; forward.setAttribute('aria-label','Next figure');
  controls.append(label, back, forward);
  const caption = element('div','caption');
  const imageNote = element('p','image-note'); imageNote.hidden = true;
  function update() {
    const figure = figures[index]; imageNote.hidden = true; open.hidden = false;
    image.alt = figure.caption || `${figure.label} from ${paper.title}`; image.src = figure.url;
    label.textContent = `${figure.label} · ${index+1} / ${figures.length}`;
    back.disabled = index === 0; forward.disabled = index === figures.length-1;
    caption.replaceChildren();
    if (figure.caption.length > 240) {
      caption.append(element('p','',figure.caption.slice(0,240)+'…'));
      const detail = element('details'); detail.append(element('summary','','Full caption'),element('p','',figure.caption)); caption.append(detail);
    } else caption.textContent = figure.caption;
  }
  image.addEventListener('error', () => { open.hidden = true; imageNote.hidden = false; imageNote.textContent = 'This image could not be loaded. Try another figure or open the paper.'; });
  back.addEventListener('click', () => { index--; update(); }); forward.addEventListener('click', () => { index++; update(); });
  open.addEventListener('click', () => {
    const figure = figures[index]; $('figure-title').textContent = `${figure.label} preview`;
    $('large-figure').referrerPolicy = 'no-referrer'; $('large-figure').src = figure.url; $('large-figure').alt = image.alt;
    $('large-caption').textContent = figure.caption; $('figure-dialog').showModal();
  });
  visual.append(open, controls, caption, imageNote); update();
}
function renderPaper(paper, token) {
  const card = element('article','paper-card'); card.dataset.paperId = String(paper.paperId);
  const content = element('div','paper-content');
  const meta = [paper.arxivId ? `arXiv · ${paper.arxivId}` : 'Research paper', paper.published].filter(Boolean).join('  /  ');
  const heading = element('h2','',paper.title); heading.id = `paper-${paper.paperId}`; card.setAttribute('aria-labelledby',heading.id);
  const abstract = element('p','abstract',paper.abstract || 'The abstract is not available yet.');
  const links = element('div','paper-links');
  if (paper.url) links.append(external('Read paper ↗',paper.url));
  links.append(external('Scholar Inbox ↗',paper.scholarUrl));
  content.append(element('p','paper-meta',meta),heading,element('p','authors',paper.authors),element('p','abstract-label','Abstract'),abstract,links);
  const visual = element('div','visual'); showFigure(visual,paper); card.append(content,visual);
  if (!paper.figures.length || !paper.abstract) {
    let pending = false;
    if (!paper.figures.length && !paper.firstPage) visual.replaceChildren(element('div','figure-placeholder','Looking for a figure…'));
    card.loadDetails = () => {
      if (pending) return;
      pending = true;
      detailsQueue.push({card,token,run:async () => {
        try {
          const enriched = await send('digestDetail',{paper:{paperId:paper.paperId,slug:paper.slug}});
          if (token !== generation || !card.isConnected) return;
          if (enriched.abstract) abstract.textContent = enriched.abstract;
          showFigure(visual,enriched);
        } catch (error) {
          if (token !== generation || !card.isConnected) return;
          if (error.code === 'AUTH_REQUIRED') { signedOut(error); return; }
          showFigure(visual,paper);
          const note = element('p','image-note','Could not load additional paper details. ');
          const retry = element('button','','Retry details'); retry.type = 'button';
          retry.addEventListener('click',() => {note.remove();card.loadDetails();}); note.append(retry); visual.append(note);
        } finally { pending = false; }
      }}); pumpDetails();
    };
    observer.observe(card);
  }
  return card;
}
let acknowledged=null;
function acknowledgeVisibleDigest() {
  if(preview||document.visibilityState!=='visible'||!currentData?.accountKey||!currentDate||!knownIds.size)return;
  const receipt=currentData.accountKey+':'+currentDate;
  if(receipt===acknowledged)return;
  acknowledged=receipt;
  send('digestViewed',{values:{accountKey:currentData.accountKey,date:currentDate}}).catch(()=>{acknowledged=null;});
}
document.addEventListener('visibilitychange',acknowledgeVisibleDigest);
async function load(date = null, append = false) {
  const token = append ? generation : ++generation;
  if (!append) {clearPapers(); currentDate = date; currentPage = 0; currentData = null;}
  $('papers').setAttribute('aria-busy','true'); $('refresh').disabled = true; $('more').disabled = true;
  $('previous').disabled = $('next').disabled = true;
  status(append ? 'Loading more papers…' : 'Loading your digest…');
  try {
    const data = await send('digest',{date, page:append ? currentPage+1 : 0});
    if (token !== generation) return;
    currentData = data; currentDate = data.date; currentPage = data.page; $('date').value = data.date || '';
    for (const paper of data.papers) if (!knownIds.has(paper.paperId)) { knownIds.add(paper.paperId); $('papers').append(renderPaper(paper,token)); }
    $('count').textContent = `${knownIds.size} paper${knownIds.size === 1 ? '' : 's'}`;
    $('empty').hidden = knownIds.size !== 0; $('more').hidden = !data.hasMore;
    $('previous').disabled = !data.previousDate; $('next').disabled = !data.nextDate;
    acknowledgeVisibleDigest();
    status(data.skipped ? 'Some entries could not be displayed. Open Scholar Inbox to see the complete digest.' : '');
  } catch (error) {
    if (token !== generation) return;
    if (error.code === 'AUTH_REQUIRED') { signedOut(error); return; }
    status(error.message,true);
    $('previous').disabled = !currentData?.previousDate; $('next').disabled = !currentData?.nextDate;
  } finally {
    if (token === generation) { $('papers').setAttribute('aria-busy','false'); $('refresh').disabled = false; $('more').disabled = false; }
  }
}
$('date-form').addEventListener('submit',event => {event.preventDefault(); if ($('date').value) load($('date').value); else status('Choose a digest date, or select Latest.',true);});
$('latest').addEventListener('click',()=>load()); $('refresh').addEventListener('click',()=>load(currentDate));
$('previous').addEventListener('click',()=>load(currentData.previousDate)); $('next').addEventListener('click',()=>load(currentData.nextDate));
$('more').addEventListener('click',()=>load(currentDate,true));
$('close-figure').addEventListener('click',()=>$('figure-dialog').close());
$('figure-dialog').addEventListener('close',()=>{$('large-figure').removeAttribute('src');$('large-caption').textContent='';});
$('large-figure').addEventListener('error',()=>{$('large-caption').textContent='This image could not be loaded. Close this preview and open the paper instead.';});
if (preview) $('preview-note').hidden = false;
const initialDate=new URLSearchParams(location.search).get('date');
load(/^\d{4}-\d{2}-\d{2}$/.test(initialDate||'')?initialDate:null);
