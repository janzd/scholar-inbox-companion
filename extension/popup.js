import {SITE} from "./core.js";
import {sourcePlan, readDocument, paperMetadata, fetchPublic} from "./sources.js";
import {readPdf, MAX_PDF_BYTES} from "./pdf.js";
const $ = id => document.getElementById(id);
let currentPaper = null, collections = [], selectedId = null, busy = false;
let metadata = {}, plan = {}, generation = 0;
const preview = !globalThis.chrome?.runtime?.id && new URLSearchParams(location.search).has("preview");
const reloadMessage = "The extension’s background worker needs reloading. Open chrome://extensions, click Reload on Scholar Inbox Companion, then reopen this popup.";

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (response?.error === "Unknown request.") throw new Error(reloadMessage);
  if (!response?.ok) throw new Error(response?.error || "The extension could not complete the request. Close and reopen it.");
  return response.data;
}

function status(message, error = false) { $("status").textContent = message; $("status").classList.toggle("error", error); }
function error(message) {
  if (message === reloadMessage) {
    resetResults(); status(message, true);
    for (const id of ["retry", "manual", "pdf-tools"]) $(id).hidden = true;
    return;
  }
  status(message, true); $("retry").hidden = false;
  $("manual").hidden = false; $("search").disabled = false; $("pdf-tools").hidden = false;
  $("read-pdf").hidden = !plan.supported;
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
  $("source-label").textContent = currentPaper.arxivId ? `arXiv · ${currentPaper.arxivId}` : (plan.label || "Paper");
  $("match-label").textContent = data.match === "exact" ? "✓ Exact ID match" : data.match === "title" ? "✓ Title match" : "✓ Selected by you";
  $("scholar-link").href = `${SITE}/paper/${encodeURIComponent(currentPaper.slug)}`;
  $("paper").hidden = false; $("manual").hidden = true; $("retry").hidden = true;
  $("candidates").hidden = true; $("pdf-tools").hidden = true; $("edit-title").hidden = false;
  $("result").hidden = true; $("filter").value = ""; status(""); renderCollections(); updateButton();
}

function resetResults() {
  currentPaper = null; selectedId = null;
  $("paper").hidden = true; $("candidates").hidden = true; $("edit-title").hidden = true;
}

function manual(message, suggestion = "") {
  resetResults(); status(message); $("manual").hidden = false; $("search").disabled = false;
  $("manual-title").value = suggestion; $("pdf-tools").hidden = false;
  $("read-pdf").hidden = !plan.supported;
}

function showCandidates(data, ticket) {
  collections = data.collections;
  const list = $("candidate-list"); list.replaceChildren();
  $("manual").hidden = false; $("search").disabled = false;
  $("candidates").hidden = !data.candidates.length;
  status(data.candidates.length ? "No unique identifier match. Choose the correct record below." : "No matching record found in the first 20 results. Try editing the title; the paper may not be indexed yet.");
  for (const candidate of data.candidates) {
    const card = document.createElement("article"); card.className = "candidate";
    const title = document.createElement("h3"); title.textContent = candidate.title;
    const details = document.createElement("p"); details.textContent = [candidate.authors, candidate.year].filter(Boolean).join(" · ");
    const link = document.createElement("a"); link.textContent = "Scholar Inbox ↗";
    link.href = `${SITE}/paper/${encodeURIComponent(candidate.slug)}`; link.target = "_blank"; link.rel = "noopener noreferrer";
    const choose = document.createElement("button"); choose.className = "secondary"; choose.textContent = "Use this paper";
    choose.addEventListener("click", async () => {
      if (ticket !== generation) return;
      const next = ++generation;
      for (const button of list.querySelectorAll("button")) button.disabled = true;
      status("Checking this paper and its collection membership…");
      try {
        const result = preview ? {paper: {...candidate, collectionIds: []}} : await send({type: "choose", candidate});
        if (next === generation) showPaper({...result, collections, match: "selected"});
      } catch (e) { if (next === generation) { resetResults(); error(e.message); } }
    });
    card.append(title, details, link, choose); list.append(card);
  }
}

async function lookup(title) {
  if (busy) return;
  if (preview) { status("Design preview only. No search was sent."); return; }
  const ticket = ++generation; resetResults();
  $("search").disabled = true; $("retry").hidden = true; $("pdf-tools").hidden = true;
  status("Finding this paper in Scholar Inbox…");
  try {
    const data = await send({type: "resolve", metadata: {...metadata, title}});
    if (ticket !== generation) return;
    if (data.paper) showPaper(data); else showCandidates(data, ticket);
  } catch (e) { if (ticket === generation) error(e.message); }
}

async function suggestPdf(bytes, ticket) {
  const result = await readPdf(bytes);
  if (ticket !== generation) return;
  metadata = {...metadata, authors: result.authors ? [result.authors] : []};
  if (result.title?.trim()) {
    $("manual-title").value = result.title;
    await lookup(result.title);
  } else {
    manual("This PDF has no readable title. Paste the title below (scanned PDFs need manual entry).");
  }
}

async function start() {
  if (busy) return;
  const ticket = ++generation; metadata = {}; plan = {}; resetResults();
  $("manual-title").value = "";
  for (const id of ["manual", "retry", "pdf-tools"]) $(id).hidden = true;
  status("Finding the paper in this tab…");
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (ticket !== generation) return;
    plan = sourcePlan(tab?.url);
    if (!plan.supported) { manual("Enter a paper title, or choose a downloaded PDF."); return; }
    metadata = {arxivId: plan.arxivId};
    let raw = {};
    if (plan.arxivId) {
      const {html} = await send({type: "metadata", arxivId: plan.arxivId});
      raw = readDocument(new DOMParser().parseFromString(html, "text/html"));
    } else {
      try {
        const results = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: readDocument});
        raw = results[0]?.result || {};
      } catch { /* Chrome's PDF viewer and restricted pages cannot be injected. */ }
      if (!raw.title && plan.landingUrl && plan.landingUrl !== plan.url) {
        try {
          status("Reading the paper’s landing page…");
          const bytes = await fetchPublic(plan.landingUrl, {maxBytes: 2 * 1024 * 1024});
          raw = readDocument(new DOMParser().parseFromString(new TextDecoder().decode(bytes), "text/html"));
        } catch { /* Fall back to the open PDF or an editable title. */ }
      }
    }
    if (ticket !== generation) return;
    metadata = paperMetadata(raw, plan);
    if (metadata.title) { $("manual-title").value = metadata.title; await lookup(metadata.title); return; }
    if (plan.isPdf || raw.contentType === "application/pdf") {
      status("Reading the PDF title locally…");
      await suggestPdf(await fetchPublic(plan.url), ticket);
      return;
    }
    manual("No paper citation found. Enter or check the title before searching.", metadata.suggestedTitle);
  } catch (e) { if (ticket === generation) error(e.message); }
}

$("edit-title").addEventListener("click", () => {
  if (busy) return;
  ++generation; manual("Edit the title to search again.", $("manual-title").value); $("manual-title").focus();
});
$("read-pdf").addEventListener("click", async () => {
  if (busy || !plan.supported) return;
  const ticket = ++generation; resetResults(); $("pdf-tools").hidden = true; $("search").disabled = true;
  status("Reading the PDF title locally…");
  try { await suggestPdf(await fetchPublic(plan.url), ticket); }
  catch (e) { if (ticket === generation) error(`${e.message} If the URL redirects, open the final PDF URL and retry.`); }
});
$("pdf-file").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file || busy) return;
  const ticket = ++generation; metadata = {}; resetResults(); $("pdf-tools").hidden = true; $("search").disabled = true;
  status("Reading the selected PDF locally…");
  try {
    if (file.size > MAX_PDF_BYTES) throw new Error("Choose a PDF smaller than 25 MB, or enter its title.");
    await suggestPdf(new Uint8Array(await file.arrayBuffer()), ticket);
  } catch (e) { if (ticket === generation) error(e.message); }
  finally { event.target.value = ""; }
});

$("filter").addEventListener("input", () => {
  selectedId = null; renderCollections(); updateButton();
});
$("manual-title").addEventListener("input", () => {
  ++generation; resetResults(); $("search").disabled = false; status("Search with the edited title when ready.");
});
$("retry").addEventListener("click", start);
$("search").addEventListener("click", () => lookup($("manual-title").value.trim()));
$("save").addEventListener("click", async () => {
  if (!currentPaper || !selectedId || busy) return;
  if (preview) { $("result").textContent = "Design preview only. No paper was saved."; $("result").hidden = false; return; }
  const collectionId = selectedId;
  busy = true; $("edit-title").disabled = true; $("retry").disabled = true; renderCollections(); updateButton(); $("result").hidden = true;
  try {
    const result = await send({type: "save", selection: {...currentPaper, collectionId}});
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
  } finally { busy = false; $("edit-title").disabled = false; $("retry").disabled = false; renderCollections(); updateButton(); }
});

if (preview) {
  $("preview-note").hidden = false;
  const sample = {match: "exact", paper: {paperId: 4842939, arxivId: "2609.04649", slug: "Mahajan2026ARXIV_ReaDiT_Guidance_Control_for", title: "ReaDiT Guidance: Control for Image and Video Generation using Diffusion Transformer Features", authors: "Jay Mahajan, Chang Liu, Rauf Makharov, Viraj Shah, Alexander Schwing, Svetlana Lazebnik", collectionIds: ["sample-3"]}, collections: ["Data Augmentation", "Decomposition", "Diffusion Models", "Image Editing", "Segmentation"].map((name,i) => ({id:`sample-${i}`,name,writable:true}))};
  const view = new URLSearchParams(location.search).get("view");
  if (view === "candidates") {
    metadata = {}; $("manual-title").value = "Segment and Caption Anything";
    showCandidates({collections: sample.collections, candidates: [{paperId: 42, slug: "sample", title: "Segment and Caption Anything", authors: "Xiaoke Huang, Jianfeng Wang", year: "2024"}]}, generation);
  } else if (view === "manual") { manual("Review the title extracted from the PDF, then search.", "Segment and Caption Anything"); }
  else { showPaper(sample); }
} else { start(); }
