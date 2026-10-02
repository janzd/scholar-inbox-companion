import {digestAccount,digestPaper} from './digest-core.js';
function validate(input){
  if(!input||!Number.isSafeInteger(input.paper?.paperId)||input.paper.paperId<=0||typeof input.paper.slug!=='string'||!/^[a-zA-Z0-9_.-]{1,500}$/.test(input.paper.slug)||typeof input.accountKey!=='string'||!/^[a-f0-9]{64}$/.test(input.accountKey))throw Error('Reload the digest before rating this paper.');
}
export async function readFeedback(client,input){
  validate(input);
  const session=await client.request('/session_info');
  if(session.is_logged_in!==true)throw Object.assign(Error('Sign in to Scholar Inbox, then reload the digest.'),{code:'AUTH_REQUIRED'});
  const username=typeof session.username==='string'&&session.username?session.username:(await client.request('/')).username;
  if(await digestAccount(username)!==input.accountKey)throw Object.assign(Error('The Scholar Inbox account changed. Reload the digest before rating.'),{code:'ACCOUNT_CHANGED'});
  const data=await client.request('/papers/'+input.paper.slug);
  if(data.is_authenticated!==true)throw Object.assign(Error('Sign in to Scholar Inbox, then reload the digest.'),{code:'AUTH_REQUIRED'});
  const paper=digestPaper(data.paper);
  if(paper.paperId!==input.paper.paperId||paper.slug!==input.paper.slug)throw Error('The paper record changed. Reload the digest before rating.');
  if(paper.rating===null)throw Error('Scholar Inbox did not return a verifiable rating. Open the paper in Scholar Inbox.');
  return {rating:paper.rating};
}
export async function rateFeedback(client,input){
  validate(input);
  if(![-1,0,1].includes(input.rating)||!(input.expectedRating===null||[-1,0,1].includes(input.expectedRating)))throw Error('Invalid paper rating.');
  const current=await readFeedback(client,input);
  if(current.rating===input.rating)return current;
  if(input.expectedRating!==null&&current.rating!==input.expectedRating)throw Object.assign(Error('The rating changed since this digest loaded. Refresh the rating before trying again.'),{code:'RATING_CHANGED'});
  try{
    await client.request('/make_rating/',{rating:input.rating,id:String(input.paper.paperId)},{allowEmpty:true});
    const confirmed=await readFeedback(client,input);
    if(confirmed.rating!==input.rating)throw Error('Unconfirmed');
    return confirmed;
  }catch{
    throw Object.assign(Error('The rating may have been saved, but could not be confirmed. Refresh the rating or check Scholar Inbox before trying again.'),{code:'RATING_UNCERTAIN'});
  }
}
