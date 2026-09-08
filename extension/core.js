export const API = "https://api.scholar-inbox.com/api";
export const SITE = "https://www.scholar-inbox.com";

export function normalizeArxivId(value) {
  if (typeof value !== "string") return null;
  const id = value.trim().replace(/^arxiv:/i, "").replace(/\.pdf$/i, "").replace(/v\d+$/i, "");
  return /^(?:\d{4}\.\d{4,5}|[a-z][a-z.-]*(?:\.[A-Z]{2})?\/\d{7})$/i.test(id) ? id.toLowerCase() : null;
}

export function arxivIdFromUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) ||
        !["arxiv.org", "www.arxiv.org", "export.arxiv.org"].includes(url.hostname) || url.username || url.password) return null;
    const match = decodeURIComponent(url.pathname).match(/^\/(?:abs|pdf|html)\/(.+?)\/?$/);
    return match ? normalizeArxivId(match[1]) : null;
  } catch { return null; }
}

export function slugFromPaper(paper) {
  const slug = paper?.cache_file_name?.replace(/\.pdf$/i, "");
  if (typeof slug !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(slug)) throw new Error("Scholar Inbox did not return a usable paper link.");
  return slug;
}

export function exactPaper(rows, arxivId) {
  const matches = (Array.isArray(rows) ? rows : []).filter(p => normalizeArxivId(p.arxiv_id) === arxivId);
  const unique = [...new Map(matches.map(p => [String(p.paper_id), p])).values()];
  if (unique.length > 1) throw new Error("Scholar Inbox returned multiple records with this arXiv ID. Open Scholar Inbox to choose the record.");
  return unique[0] ?? null;
}

export function canWrite(collection) {
  return ["owner", "editor"].includes(collection?.permission);
}

export function memberships(paper) {
  if (!Object.hasOwn(paper, "user_paper_collections")) throw new Error("Scholar Inbox did not return collection membership. Please retry after signing in.");
  if (paper.user_paper_collections == null) return [];
  if (!Array.isArray(paper.user_paper_collections)) throw new Error("Unexpected collection membership response.");
  return paper.user_paper_collections;
}

export function paperView(paper, arxivId) {
  if (normalizeArxivId(paper.arxiv_id) !== arxivId) throw new Error("Paper ID mismatch. Nothing was saved.");
  if (!Number.isSafeInteger(Number(paper.paper_id)) || Number(paper.paper_id) <= 0) throw new Error("Invalid Scholar Inbox paper identifier.");
  return {
    paperId: Number(paper.paper_id), arxivId, slug: slugFromPaper(paper),
    title: String(paper.title ?? ""), authors: String(paper.authors ?? ""),
    abstract: String(paper.abstract ?? ""),
    collectionIds: memberships(paper).map(c => String(c.id))
  };
}

export class ScholarClient {
  constructor(fetchFn = globalThis.fetch.bind(globalThis)) { this.fetch = fetchFn; }

  async request(path, body) {
    let response;
    try {
      response = await this.fetch(API + path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "include", cache: "no-store", redirect: "error",
        headers: {Accept: "application/json", ...(body === undefined ? {} : {"Content-Type": "application/json"})},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
        signal: AbortSignal.timeout(18000)
      });
    } catch {
      throw new Error("Could not reach Scholar Inbox. Check your connection and that you are signed in in this Chrome profile.");
    }
    if (response.status === 401 || response.status === 403) throw new Error("Sign in to Scholar Inbox in this Chrome profile, then retry. Access may also be restricted by the service.");
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After"));
      throw new Error(`Scholar Inbox is limiting requests. ${Number.isFinite(seconds) && seconds > 0 ? `Try again in ${seconds} seconds.` : "Wait before trying again."}`);
    }
    if (!response.ok) throw new Error(`Scholar Inbox returned an error (${response.status}). Please try again later.`);
    let data;
    try { data = await response.json(); } catch { throw new Error("Scholar Inbox returned an unexpected response."); }
    if (data.success === false) throw new Error("Scholar Inbox could not complete this request. Please check your sign-in and try again.");
    return data;
  }

  async session() {
    const data = await this.request("/session_info");
    if (data.is_logged_in !== true) throw new Error("Sign in to Scholar Inbox in this Chrome profile, then click Retry.");
  }

  async collections() {
    const data = await this.request("/get_all_user_collections");
    if (!Array.isArray(data.collections)) throw new Error("Scholar Inbox did not return your collections.");
    return data.collections.filter(c => c.id != null && typeof c.name === "string")
      .map(c => ({id: String(c.id), name: c.name, permission: c.permission, writable: canWrite(c)}))
      .sort((a,b) => a.name.localeCompare(b.name));
  }

  async arxivPage(id) {
    if (normalizeArxivId(id) !== id) throw new Error("Invalid arXiv identifier.");
    let response;
    try {
      response = await this.fetch(`https://arxiv.org/abs/${id}`, {credentials: "omit", signal: AbortSignal.timeout(18000)});
    } catch { throw new Error("Could not load the arXiv abstract page. You can enter the paper title below."); }
    if (!response.ok) throw new Error("arXiv could not provide the abstract page. You can enter the paper title below.");
    const html = await response.text();
    if (html.length > 2000000) throw new Error("The arXiv page was unexpectedly large. Enter the paper title below.");
    return html;
  }

  async detail(slug, arxivId) {
    if (typeof slug !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(slug)) throw new Error("Invalid paper link.");
    const data = await this.request(`/papers/${encodeURIComponent(slug)}`);
    if (data.is_authenticated !== true) throw new Error("Your Scholar Inbox session is unavailable. Sign in and retry.");
    return paperView(data.paper, arxivId);
  }

  async lookup(arxivId, title, {parallel = true} = {}) {
    if (normalizeArxivId(arxivId) !== arxivId || typeof title !== "string" || !title.trim() || title.length > 1000) throw new Error("Enter the paper’s title to search.");
    await this.session();
    // Collections do not depend on the paper search. Start both after sign-in
    // is checked, while keeping detail lookup dependent on an exact ID match.
    const paperTask = (async () => {
      const data = await this.request("/search", {
        mode: "text", q: title.trim(), p: 0, n_results: 20,
        searchIn: ["title"], show: ["all"], orderBy: "query match",
        correct_search_prompt: false, include: ["papers"]
      });
      const paper = exactPaper(data.digest_df, arxivId);
      if (!paper) throw new Error("No exact arXiv ID match was found among the title search results. Check the title below; the paper may not be indexed yet.");
      return await this.detail(slugFromPaper(paper), arxivId);
    })();
    // Sequential mode is used only by the local comparison page.
    if (!parallel) return {paper: await paperTask, collections: await this.collections()};
    const [current, collections] = await Promise.all([paperTask, this.collections()]);
    return {paper: current, collections};
  }

  async save({slug, arxivId, paperId, collectionId}) {
    if (normalizeArxivId(arxivId) !== arxivId || typeof collectionId !== "string") throw new Error("Invalid save request.");
    await this.session();
    const paper = await this.detail(slug, arxivId);
    if (paper.paperId !== paperId) throw new Error("The paper record changed. Nothing was saved; reopen the extension.");
    const collection = (await this.collections()).find(c => c.id === collectionId);
    if (!collection || !collection.writable) throw new Error("This collection is unavailable or read-only. Nothing was saved.");
    if (paper.collectionIds.includes(collectionId)) return {state: "already_saved", collectionName: collection.name};
    // One deliberate write. Never automatically retry an uncertain save.
    let result;
    try {
      result = await this.request("/add_paper_to_collection/", {
        collection_id: collectionId, collection_name: collection.name, paper_id: String(paperId)
      });
    } catch {
      return {state: "unconfirmed", collectionName: collection.name};
    }
    if (result.success !== true) return {state: "unconfirmed", collectionName: collection.name};
    try {
      const updated = await this.detail(slug, arxivId);
      if (updated.collectionIds.includes(collectionId)) return {state: "saved", collectionName: collection.name};
    } catch { /* A write may have succeeded despite a read-back failure. */ }
    return {state: "unconfirmed", collectionName: collection.name};
  }
}
