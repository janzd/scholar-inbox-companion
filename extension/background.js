import {ScholarClient} from "./core.js";
const client = new ScholarClient();
let saving = false;

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  // Only our own popup can request operations. No content scripts or external messaging.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("popup.html")) return false;
  (async () => {
    switch (message?.type) {
      case "metadata": return {html: await client.arxivPage(message.arxivId)};
      case "lookup": return await client.lookup(message.arxivId, message.title);
      case "resolve": return await client.resolve(message.metadata);
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
