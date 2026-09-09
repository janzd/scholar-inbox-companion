import {arxivIdFromUrl, normalizeArxivId, normalizeDoi} from "./core.js";

export function sourcePlan(value) {
  let url;
  try { url = new URL(value); } catch { return {label: "Paper", supported: false}; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return {label: "Paper", supported: false};
  url.hash = "";
  const arxivId = arxivIdFromUrl(url.href);
  if (arxivId) return {supported: true, label: "arXiv", arxivId, url: url.href, landingUrl: `https://arxiv.org/abs/${arxivId}`};
  const isPdf = /\.pdf$/i.test(url.pathname);
  if (url.hostname === "openaccess.thecvf.com") {
    const landing = new URL(url);
    if (isPdf && /\/papers\//.test(url.pathname)) landing.pathname = url.pathname.replace("/papers/", "/html/").replace(/\.pdf$/i, ".html");
    return {supported: true, label: "CVF Open Access", url: url.href, isPdf, landingUrl: landing.href};
  }
  if (["openreview.net", "www.openreview.net"].includes(url.hostname)) {
    const id = url.searchParams.get("id");
    return {supported: true, label: "OpenReview", url: url.href,
      isPdf: url.pathname === "/pdf" || isPdf,
      landingUrl: id && ["/pdf", "/forum"].includes(url.pathname) ? `${url.origin}/forum?id=${encodeURIComponent(id)}` : url.href};
  }
  return {supported: true, label: isPdf ? "PDF" : url.hostname, url: url.href, isPdf};
}

// Self-contained so Chrome can serialize this function into the clicked tab.
// Read citation fields only; never send the page body or browsing history.
export function readDocument(doc = document) {
  const clean = value => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
  const fields = {};
  for (const meta of [...doc.querySelectorAll("meta[name],meta[property]")].slice(0, 500)) {
    const key = (meta.getAttribute("name") || meta.getAttribute("property")).toLowerCase();
    if (/^(citation_|dc\.|dc:|dcterms\.|prism\.)/.test(key)) (fields[key] ??= []).push(clean(meta.getAttribute("content")));
  }
  const one = (...keys) => keys.map(k => fields[k]?.[0]).find(Boolean) || "";
  let host = "";
  try { host = new URL(doc.URL || doc.baseURI).hostname; } catch { /* Parsed documents get their URL from the caller. */ }
  // These selectors are distinctive and also work on fetched landing pages.
  const siteTitle = doc.querySelector("#papertitle,h2.citation.title")?.textContent;
  const title = one("citation_title", "dc.title", "dc:title") || clean(siteTitle);
  const authors = fields.citation_author || fields["dc.creator"] || [];
  return {title, authors: authors.slice(0, 100), year: one("citation_publication_date", "citation_date", "dc.date"),
    doi: one("citation_doi", "dc.identifier", "prism.doi"), arxivId: one("citation_arxiv_id"),
    pdfUrl: one("citation_pdf_url"), contentType: doc.contentType || "",
    suggestedTitle: title ? "" : clean(doc.title), host};
}

export function paperMetadata(raw, plan) {
  let pdfUrl = "";
  try {
    const resolved = new URL(raw.pdfUrl, plan.url);
    // Only this tab's origin is eligible for a public PDF fetch.
    if (resolved.origin === new URL(plan.url).origin && !resolved.username && !resolved.password) pdfUrl = resolved.href;
  } catch { /* Missing or cross-origin PDFs remain a manual fallback. */ }
  return {title: String(raw.title || "").trim().slice(0, 1000), authors: raw.authors || [],
    year: String(raw.year || "").match(/\b(?:19|20)\d{2}\b/)?.[0] || "",
    arxivId: plan.arxivId || normalizeArxivId(raw.arxivId), doi: normalizeDoi(raw.doi),
    pdfUrl, suggestedTitle: String(raw.suggestedTitle || "").slice(0, 1000)};
}

export async function fetchPublic(url, {maxBytes = 25 * 1024 * 1024, fetchFn = globalThis.fetch.bind(globalThis)} = {}) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("This page cannot be downloaded. Enter the title below.");
  // OpenReview gates even public PDFs behind a browser verification cookie.
  // Let Chrome attach its existing session only to these HTTPS paper routes;
  // never inspect cookies, broaden host access, or follow a redirect with them.
  const openReviewPaper = parsed.protocol === "https:" &&
    ["openreview.net", "www.openreview.net"].includes(parsed.hostname) && !parsed.port &&
    ["/forum", "/pdf"].includes(parsed.pathname) && /^[A-Za-z0-9_-]{1,100}$/.test(parsed.searchParams.get("id") || "");
  // The activeTab grant covers this origin. Redirects may leave that grant, so
  // ask the user to open the final URL instead of following them implicitly.
  let response;
  try { response = await fetchFn(url, {credentials: openReviewPaper ? "include" : "omit", redirect: "error", signal: AbortSignal.timeout(20000)}); }
  catch {
    throw new Error("Could not download this page or PDF. It may require sign-in, a browser check, or opening the final URL after a redirect. Enter the title, or choose a downloaded PDF.");
  }
  if (openReviewPaper && [401, 403].includes(response.status)) throw new Error("OpenReview requires browser verification or sign-in. Open the paper page below in Chrome, complete any check, then retry. You can also enter the title or choose a downloaded PDF.");
  if (!response.ok) throw new Error(`The site returned ${response.status}. Enter the title, or choose a downloaded PDF below.`);
  if (Number(response.headers.get("Content-Length")) > maxBytes) throw new Error("This file is too large to read here (25 MB maximum for PDFs). Enter its title instead.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The site did not return a readable file.");
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) throw new Error("This file is too large to read here. Enter its title instead.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
