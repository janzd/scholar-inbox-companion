import {digestDate,figureUrl,paperUrl,loadDigestDetail,digestAccount} from './digest-core.js';
const cut=(value,max)=>{const text=String(value??'');return text.length>max?text.slice(0,max-1).replace(/[\uD800-\uDBFF]$/,'')+'…':text;};
const escapeSlack=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export async function enrichDigestPapers(client,papers,accountKey){
  const entries=papers.slice(0,5).map(p=>({...p}));let index=0;
  await Promise.all([0,1].map(async()=>{
    while(index<entries.length){const i=index++,paper=entries[i];
      if(paper.abstract&&paper.figures?.length)continue;
      try{const detail=await loadDigestDetail(client,paper);entries[i]={...paper,abstract:paper.abstract||detail.abstract,figures:paper.figures?.length?paper.figures:detail.figures,firstPage:paper.firstPage||detail.firstPage};}
      catch(error){if(error.code==='AUTH_REQUIRED')throw error;}
    }
  }));
  // Recheck identity after detail requests before sending personalized selections.
  await client.session();
  if(await digestAccount((await client.request('/')).username)!==accountKey)throw Error('Digest account changed.');
  return entries;
}
function cards(papers){return (papers||[]).slice(0,5).map(p=>({
  title:cut(p.title||'Untitled paper',240),abstract:String(p.abstract||'Abstract unavailable.'),
  scholar:paperUrl(p.scholarUrl),url:paperUrl(p.url),
  image:figureUrl(p.figures?.[0]?.url,p.paperId)||figureUrl(p.firstPage?.url,p.paperId,true)
}));}
function dateLabel(date){if(typeof date!=='string'||digestDate(date)!==date)throw Error('Invalid digest date.');return `Your Scholar Inbox digest for ${date} is ready.`;}
export function slackDigestMessage(date,papers=[]){
 const text=dateLabel(date);const entries=cards(papers);
 const blocks=[{type:'section',text:{type:'plain_text',text,emoji:false}}];
 for(const [i,p] of entries.entries()){
  blocks.push({type:'divider'},{type:'section',text:{type:'plain_text',text:`${i+1}. ${p.title}`,emoji:false}},
   {type:'section',text:{type:'plain_text',text:cut(p.abstract,2800),emoji:false}});
  const links=[[p.url,'Read paper'],[p.scholar,'Scholar Inbox']].filter(([url])=>url&&url.length<1500).map(([url,label])=>`<${escapeSlack(url).replaceAll('|','%7C')}|${label}>`).join(' · ');
  if(links)blocks.push({type:'section',text:{type:'mrkdwn',text:links,verbatim:true}});
  if(p.image)blocks.push({type:'image',image_url:p.image,alt_text:cut(`Figure preview: ${p.title}`,2000)});
 }
 blocks.push({type:'section',text:{type:'mrkdwn',text:'<https://www.scholar-inbox.com/digest|Open full digest>',verbatim:true}});
 return {text:text+'\n'+entries.map((p,i)=>`${i+1}. ${escapeSlack(p.title)}`).join('\n'),blocks,unfurl_links:false,unfurl_media:false};
}
export function discordDigestMessage(date,papers=[]){
 const content=dateLabel(date)+'\n<https://www.scholar-inbox.com/digest>';
 const embeds=cards(papers).map(p=>{
  // Each card has a 1,200-character budget: five cards stay within 6,000.
  const fields=[];
  for(const [url,name] of [[p.url,'Paper'],[p.scholar,'Scholar Inbox']]){const safeUrl=url?.replaceAll(')','%29').replaceAll('(','%28');if(safeUrl&&safeUrl.length<=350)fields.push({name,value:`[Open](${safeUrl})`,inline:true});}
  const used=p.title.length+fields.reduce((n,f)=>n+f.name.length+f.value.length,0);
  return {title:p.title,description:cut(p.abstract,1200-used),...(p.scholar?{url:p.scholar}:{}),color:0x365cc7,...(fields.length?{fields}:{}),...(p.image?{image:{url:p.image}}:{})};
 });
 return {content,allowed_mentions:{parse:[]},...(embeds.length?{embeds}:{})};
}
