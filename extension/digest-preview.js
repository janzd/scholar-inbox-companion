import {digestPaper} from './digest-core.js';

let exampleRating=0;
// Preview-only public paper metadata. No account data or service requests.
export async function previewDigest(type, options, view) {
  if(type==='digestRating'){exampleRating=options.values.rating;return {rating:exampleRating};}
  if(type==='digestRatingRead')return {rating:exampleRating};
  if (view === 'error') throw new Error('Example connection error. Refresh to try again.');
  if (view === 'signed-out') throw Object.assign(new Error('Sign in to Scholar Inbox in this Chrome profile, then refresh.'), {code:'AUTH_REQUIRED'});
  const raw = await (await fetch(new URL('./digest-preview-data.json', import.meta.url))).json();
  const paper = digestPaper(raw);
  paper.relevanceScore=87;paper.rating=exampleRating; // Clearly labeled design preview values.
  if (view === 'missing') { paper.figures = []; paper.firstPage = null; }
  if (type === 'digestDetail') return paper;
  return {papers:view === 'empty' ? [] : [paper],date:options.date || '2026-09-07',page:0,skipped:0,hasMore:false,previousDate:null,nextDate:null};
}
