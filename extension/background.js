import {DiscordDelivery} from "./discord.js";
import {SlackDelivery} from "./slack.js";
import {readFeedback,rateFeedback} from "./digest-feedback.js";
import {registerDigestAlerts} from "./digest-alerts.js";
import {digestDate, loadDigest, loadDigestDetail} from "./digest-core.js";
import {ScholarClient} from "./core.js";
import {LookupCache} from "./cache.js";
import {sourcePlan, fetchPublic} from "./sources.js";
const cache = new LookupCache({storage: chrome.storage?.session});
const client = new ScholarClient(undefined, {cache});
let saving = false;
const ratingWrites = new Set();
const discord = new DiscordDelivery({api:chrome,client});
const slack = new SlackDelivery({api:chrome,client});
const alerts = chrome.alarms ? registerDigestAlerts(chrome,client,slack,discord) : null;

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  // Each extension page has a narrow route allowlist. Only the reader can submit explicit paper ratings.
  if (sender.id !== chrome.runtime.id) return false;
  const diagnostic = sender.url === chrome.runtime.getURL("benchmark.html");
  const digestURL = chrome.runtime.getURL("digest.html");
  const digest = sender.url === digestURL || (sender.url?.startsWith(digestURL+"?date=") && !!digestDate(new URL(sender.url).searchParams.get("date")));
  const settings = sender.url === chrome.runtime.getURL("options.html");
  const popup = sender.url === chrome.runtime.getURL("popup.html");
  const allowed = settings ? ["discordStatus", "discordSettings", "slackStatus", "slackSettings", "digestAlertStatus", "digestAlertSettings", "digestAlertCheck"] : digest ? ["digest", "digestDetail", "digestViewed", "digestRating", "digestRatingRead"] : diagnostic ? ["benchmarkMode"] : popup
    ? ["metadata", "landingPage", "lookup", "resolve", "choose", "save"] : [];
  if (!allowed.includes(message?.type)) return false;
  (async () => {
    switch (message?.type) {
      case "discordStatus": return await discord.status();
      case "discordSettings": {
        alerts.epoch++;
        return await alerts.serial(()=>discord.configure(message.values));
      }
      case "slackStatus": return await slack.status();
      case "slackSettings": {
        alerts.epoch++;
        return await alerts.serial(()=>slack.configure(message.values));
      }
      case "digestRatingRead": return await readFeedback(client,message.values);
      case "digestRating": {
        const key=message.values?.paper?.paperId;
        if(ratingWrites.has(key))throw new Error("A rating is already being saved for this paper.");
        ratingWrites.add(key);
        try{return await rateFeedback(client,message.values);}finally{ratingWrites.delete(key);}
      }
      case "digestAlertStatus": return await alerts.status();
      case "digestAlertSettings": {
        const result=await alerts.configure(message.values);
        if(result.enabled)void alerts.check(true).catch(()=>{});
        return result;
      }
      case "digestAlertCheck": await alerts.check(true); return await alerts.status();
      case "digestViewed": await alerts?.viewed(message.values); return {};
      case "digest": return await loadDigest(client, {date: message.date ?? null, page: message.page ?? 0});
      case "digestDetail": return await loadDigestDetail(client, message.paper);
      case "benchmarkMode": {
        const mode = message.mode === 'baseline' ? 'baseline' : 'optimized';
        await cache.clear();
        await chrome.storage.session.set({popupBenchmarkMode: mode});
        return {mode};
      }
      case "metadata": return {html: await client.arxivPage(message.arxivId)};
      case "landingPage": {
        const plan = sourcePlan(message.url);
        if (!["OpenReview", "CVF Open Access"].includes(plan.label) || !plan.landingUrl || plan.landingUrl === plan.url) {
          throw new Error("This tab has no supported alternate paper page.");
        }
        // Fetch in the worker: document fetches can process HTTP Link preloads,
        // downloading unused publisher stylesheets into the popup.
        const bytes = await fetchPublic(plan.landingUrl, {maxBytes: 2 * 1024 * 1024});
        return {html: new TextDecoder().decode(bytes)};
      }
      case "lookup": return await client.lookup(message.arxivId, message.title);
      case "resolve": return await client.resolve(message.metadata, {refresh: message.refresh === true || message.baseline === true, parallel: message.baseline !== true});
      case "choose": return {paper: await client.choose(message.candidate)};
      case "save": {
        if (saving) throw new Error("A save is already in progress.");
        saving = true;
        try { return await client.save(message.selection); }
        finally { saving = false; }
      }
      default: throw new Error("Unknown request.");
    }
  })().then(data => reply({ok: true, data}), error => reply({ok: false, error: error.message, ...(digest ? {errorCode:error.code ?? null} : {})}));
  return true;
});
