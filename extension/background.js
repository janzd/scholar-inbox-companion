import {ScholarClient} from "./core.js";
import {LookupCache} from "./cache.js";
import {sourcePlan, fetchPublic} from "./sources.js";
const cache = new LookupCache({storage: chrome.storage?.session});
const client = new ScholarClient(undefined, {cache});
let saving = false;

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  // Only the popup handles paper operations. The bundled timing page can only
  // change diagnostic mode and clear the non-account lookup cache.
  if (sender.id !== chrome.runtime.id) return false;
  const diagnostic = sender.url === chrome.runtime.getURL("benchmark.html");
  if (diagnostic ? message?.type !== 'benchmarkMode' : sender.url !== chrome.runtime.getURL("popup.html") || message?.type === 'benchmarkMode') return false;
  (async () => {
    switch (message?.type) {
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
  })().then(data => reply({ok: true, data}), error => reply({ok: false, error: error.message}));
  return true;
});
