import {arxivIdFromUrl, SITE} from "./core.js";
const $ = id => document.getElementById(id);
let currentId = null, currentPaper = null, collections = [], selectedId = null, busy = false;
const preview = !globalThis.chrome?.runtime?.id && new URLSearchParams(location.search).has("preview");

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "The extension could not complete the request. Close and reopen it.");
  return response.data;
}

function status(message, error = false) { $("status").textContent = message; $("status").classList.toggle("error", error); }
function error(message) {
  status(message, true); $("retry").hidden = false;
  $("manual").hidden = !currentId; $("search").disabled = false;
}

function renderCollections() {
  const list = $("collections"); list.replaceChildren();
  const query = $("filter").value.trim().toLowerCase();
  const visible = collections.filter(c => c.name.toLowerCase().includes(query));
  for (const collection of visible) {
    const saved = currentPaper.collectionIds.includes(collection.id);
    const label = document.createElement("label"); label.className = "collection";
    const radio = document.createElement("input"); radio.type = "radio"; radio.name = "collection"; radio.value = collection.id;
    radio.disabled = busy || saved || !collection.writable; radio.checked = selectedId === collection.id;
    radio.addEventListener("change", () => { selectedId = collection.id; updateButton(); });
    const name = document.createElement("span"); name.className = "name"; name.textContent = collection.name;
    label.append(radio, name);
    if (saved || !collection.writable) {
      const note = document.createElement("span"); note.className = "note" + (!collection.writable ? " readonly" : "");
      note.textContent = saved ? "✓ Already saved" : "Read-only"; label.append(note);
    }
    list.append(label);
  }
  $("empty-collections").hidden = visible.length !== 0;
  $("collection-count").textContent = `${collections.length} collections`;
}

function updateButton() {
  const collection = collections.find(c => c.id === selectedId);
  $("save").disabled = busy || !collection || !collection.writable || currentPaper.collectionIds.includes(selectedId);
  $("save").textContent = busy ? "Saving and checking…" : collection ? `Save to ${collection.name}` : "Choose a collection";
}

function showPaper(data) {
  currentPaper = data.paper; collections = data.collections; selectedId = null;
  $("paper-title").textContent = currentPaper.title; $("authors").textContent = currentPaper.authors;
  $("arxiv-id").textContent = `arXiv · ${currentPaper.arxivId}`;
  $("scholar-link").href = `${SITE}/paper/${encodeURIComponent(currentPaper.slug)}`;
  $("paper").hidden = false; $("manual").hidden = true; $("retry").hidden = true;
  $("result").hidden = true; $("filter").value = ""; status(""); renderCollections(); updateButton();
}

async function lookup(title) {
  $("search").disabled = true; $("retry").hidden = true; status("Matching the arXiv ID in Scholar Inbox…");
  try { showPaper(await send({type: "lookup", arxivId: currentId, title})); }
  catch (e) { error(e.message); }
}

async function start() {
  currentPaper = null; selectedId = null; $("paper").hidden = true; $("manual").hidden = true; $("retry").hidden = true;
  status("Finding the paper in this tab…");
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    currentId = arxivIdFromUrl(tab?.url);
    if (!currentId) { status("Open an arXiv abstract, HTML, or PDF page, then click the extension again."); return; }
    status("Reading the paper title from arXiv…");
    const {html} = await send({type: "metadata", arxivId: currentId});
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.querySelector('meta[name="citation_title"]')?.content || doc.querySelector("h1.title")?.textContent?.replace(/^\s*Title:\s*/, "");
    if (!title?.trim()) throw new Error("Could not identify the paper title. Paste it below to continue.");
    $("manual-title").value = title.trim(); await lookup(title.trim());
  } catch (e) { error(e.message); }
}

$("filter").addEventListener("input", () => {
  selectedId = null; renderCollections(); updateButton();
});
$("retry").addEventListener("click", start);
$("search").addEventListener("click", () => lookup($("manual-title").value.trim()));
$("save").addEventListener("click", async () => {
  if (!currentPaper || !selectedId || busy) return;
  if (preview) { $("result").textContent = "Design preview only. No paper was saved."; $("result").hidden = false; return; }
  const collectionId = selectedId;
  busy = true; renderCollections(); updateButton(); $("result").hidden = true;
  try {
    const result = await send({type: "save", selection: {slug: currentPaper.slug, arxivId: currentPaper.arxivId, paperId: currentPaper.paperId, collectionId}});
    const confirmed = result.state === "saved" || result.state === "already_saved";
    $("result").classList.toggle("warning", !confirmed);
    $("result").textContent = confirmed
      ? `${result.state === "saved" ? "Saved to" : "Already in"} ${result.collectionName}. Confirmed in Scholar Inbox.`
      : "The save could not be confirmed. It may have succeeded. Check the Scholar Inbox link before trying again.";
    if (confirmed) currentPaper.collectionIds.push(collectionId);
    else { $("retry").hidden = false; }
    $("result").hidden = false;
    selectedId = null;
  } catch (e) {
    $("result").textContent = e.message; $("result").classList.add("warning"); $("result").hidden = false;
  } finally { busy = false; renderCollections(); updateButton(); }
});

if (preview) {
  $("preview-note").hidden = false;
  showPaper({paper: {paperId: 4842939, arxivId: "2609.04649", slug: "Mahajan2026ARXIV_ReaDiT_Guidance_Control_for", title: "ReaDiT Guidance: Control for Image and Video Generation using Diffusion Transformer Features", authors: "Jay Mahajan, Chang Liu, Rauf Makharov, Viraj Shah, Alexander Schwing, Svetlana Lazebnik", collectionIds: ["sample-3"]}, collections: ["Data Augmentation", "Decomposition", "Diffusion Models", "Image Editing", "Segmentation"].map((name,i) => ({id:`sample-${i}`,name,writable:true}))});
} else { start(); }
