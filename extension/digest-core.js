import {candidateView, SITE} from './core.js';

export function digestDate(value) {
  if (typeof value !== 'string') return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  const legacy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!iso && !legacy) return null;
  const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(legacy[3]), Number(legacy[1]), Number(legacy[2])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2200 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` : null;
}

export function digestQuery({date = null, page = 0} = {}) {
  if (!Number.isInteger(page) || page < 0 || page > 100) throw new Error('Invalid digest page.');
  const params = new URLSearchParams();
  if (date !== null) {
    const normalized = digestDate(date);
    if (!normalized || normalized !== date) throw new Error('Choose a valid digest date.');
    const [year, month, day] = date.split('-');
    params.set('date', `${month}-${day}-${year}`);
  }
  if (page > 0) {
    if (!date) throw new Error('Choose a date before loading more papers.');
    params.set('p', String(page));
  }
  return '/' + (params.size ? `?${params}` : '');
}

export function paperUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function figureUrl(value, paperId, firstPage = false) {
  try {
    if (typeof value !== 'string' || value.length > 1000) return null;
    const url = new URL(value, SITE);
    const folder = firstPage ? 'first_pages' : 'teaser_figures';
    const pattern = new RegExp(`^/${folder}/${paperId}(?:\\.\\d+)?\\.(?:jpe?g|png|webp)$`, 'i');
    return url.origin === SITE && !url.username && !url.password && !url.search && !url.hash && pattern.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export function digestPaper(raw) {
  const identity = candidateView(raw);
  const figures = [];
  const seen = new Set();
  for (const figure of Array.isArray(raw.teaser_figures) ? raw.teaser_figures.slice(0,30) : []) {
    const url = figureUrl(figure?.imageUrl, identity.paperId);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    figures.push({url, caption:String(figure.caption ?? '').slice(0,10000), label:figure.figureType === 'Table' ? 'Table' : 'Figure', number:Number.isFinite(figure.figureNumber) ? figure.figureNumber : null});
  }
  // Prefer an actual figure over a table for the initial preview.
  figures.sort((a,b) => Number(a.label === 'Table') - Number(b.label === 'Table'));
  const firstPage = figureUrl(raw.first_page_image?.imageUrl, identity.paperId, true);
  return {...identity, abstract:String(raw.abstract ?? '').slice(0,30000), url:paperUrl(raw.url) || (identity.arxivId ? `https://arxiv.org/abs/${identity.arxivId}` : null),
    scholarUrl:`${SITE}/paper/${identity.slug}`, published:digestDate(raw.publication_date), figures,
    firstPage:firstPage ? {url:firstPage, caption:'First page of the paper. Scholar Inbox did not provide a figure preview.', label:'First page', number:null} : null};
}

export function normalizeDigest(data, requestedDate = null, page = 0) {
  if (data?.is_authenticated === false) throw Object.assign(new Error('Sign in to Scholar Inbox in this Chrome profile, then refresh.'), {code:'AUTH_REQUIRED'});
  if (!Array.isArray(data?.digest_df)) throw new Error('Scholar Inbox returned an unexpected digest. Please retry.');
  const papers = [], seen = new Set();
  let skipped = Math.max(0, data.digest_df.length - 200);
  for (const raw of data.digest_df.slice(0,200)) {
    try {
      const paper = digestPaper(raw);
      if (!seen.has(paper.paperId)) { seen.add(paper.paperId); papers.push(paper); }
    } catch { skipped++; }
  }
  const date = digestDate(data.current_digest_date) || digestDate(data.to_date) || digestDate(data.from_date) || requestedDate;
  return {papers, date, page, skipped, hasMore:data.has_more_papers_in_digest === true && !!date && page < 100,
    previousDate:digestDate(data.prev_date), nextDate:digestDate(data.next_date)};
}

export async function digestAccount(username) {
  if(typeof username!=='string'||!username.trim()||username.length>500)return null;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('scholar-inbox:'+username.trim()));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}

export async function loadDigest(client, options = {}) {
  const path = digestQuery(options);
  await client.session();
  let data = await client.request(path);
  // The website may default to a saved date range. This reader shows one daily
  // digest at a time; resolve Latest to the end of that range before paging it.
  const from = digestDate(data.from_date), to = digestDate(data.to_date);
  if (options.date == null && from && to && from !== to) {
    data = await client.request(digestQuery({date:to}));
    return {...normalizeDigest(data, to, 0),accountKey:await digestAccount(data.username)};
  }
  return {...normalizeDigest(data, options.date ?? null, options.page ?? 0),accountKey:await digestAccount(data.username)};
}

export async function loadDigestDetail(client, expected) {
  if (!expected || !Number.isSafeInteger(expected.paperId) || expected.paperId <= 0 || typeof expected.slug !== 'string' || !/^[a-zA-Z0-9_.-]{1,500}$/.test(expected.slug)) throw new Error('Invalid paper. Refresh your digest.');
  await client.session();
  const data = await client.request(`/papers/${expected.slug}`);
  if (data.is_authenticated !== true) throw Object.assign(new Error('Sign in to Scholar Inbox in this Chrome profile, then refresh.'), {code:'AUTH_REQUIRED'});
  const paper = digestPaper(data.paper);
  if (paper.paperId !== expected.paperId || paper.slug !== expected.slug) throw new Error('The paper record changed. Refresh your digest.');
  return paper;
}
