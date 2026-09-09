# Observed Scholar Inbox contract

Base: `https://api.scholar-inbox.com/api`. Observed in public frontend module `api-BNAoYqFm.js`, with collection field usage in `paper-display-xJn1Qnce.js`. These are the website’s internal session endpoints, with compatibility limitations documented in the README.

| Operation | Request | Relevant response |
| --- | --- | --- |
| Check login | `GET /session_info` | `is_logged_in` (only the Boolean is used) |
| List collections | `GET /get_all_user_collections` | `collections`: `id`, `name`, `permission`, `uuid`, `color` |
| Search | `POST /search` | `digest_df`: `paper_id`, `arxiv_id`, `cache_file_name`, title, authors |
| Fresh paper detail | `GET /papers/{cache-name-without-.pdf}` | `is_authenticated`, `paper.user_paper_collections` |
| Add | `POST /add_paper_to_collection/` | `success`, followed by an independent detail read-back |

Search body:

```json
{"mode":"text","q":"PAPER TITLE","p":0,"n_results":20,"searchIn":["title"],"show":["all"],"orderBy":"query match","correct_search_prompt":false,"include":["papers"]}
```

Add body:

```json
{"collection_id":"SELECTED ID","collection_name":"CURRENT SERVER NAME","paper_id":"VERIFIED PAPER ID"}
```

The website sends collection and paper IDs as strings and checks current membership entries using their `id` field. The prototype allows writes only for `owner` and `editor`; unrecognized permissions remain read-only until verified.

No personal collection identifiers or credentials are embedded in the extension. The design preview uses fabricated collection IDs and explicitly labels them as examples.

## Official User API review — September 9, 2026

Inspected the authenticated API docs opened from Scholar Inbox Settings → API & MCP Access → API docs. The displayed API version is 0.1.0 (OpenAPI 3.1). The current reference documents only `GET /health` and `GET /v1/digest`.

The digest endpoint uses `Authorization: Bearer <API key>` and accepts optional `start_date`, `end_date`, and integer `top_k` (default 10). Paper fields are `paper_id`, `title`, `authors`, `url`, `abstract`, `ranking_score`, `publication_date`, `digest_date`, `source`, `conference`, and `arxiv_id`. No figure, caption, contribution summary, collection membership, or Scholar Inbox frontend slug fields are documented.

A read-only Swagger UI test with `start_date=2026-09-07`, `end_date=2026-09-07`, and `top_k=1` returned HTTP 200, `success: true`, and one paper: ReaDiT Guidance (arXiv 2609.04649, Scholar Inbox paper ID 4842939). The response included a full abstract and an arXiv PDF URL. This verifies API-key authentication and digest retrieval, not collection saving. No key values or credential-bearing documentation URLs are recorded in this package.

Implications:
- Use the official digest endpoint as a candidate source for the planned rich reader. Figures/captions and optional contribution summaries need an additional source.
- The current documented API cannot replace arbitrary arXiv title lookup, collection listing, or collection saves. Retain the existing session integration for those operations unless additional documented endpoints become available.
- Digest records could seed a local arXiv-ID-to-paper-ID index for papers already fetched, but do not provide complete arbitrary-paper coverage or the frontend slug used by the current extension.
- MCP settings describe reading access and show a `get_digest(start_date, end_date, top_k)` example. An MCP connection and its full tool list were not tested or installed during this review.
- Review only: the installed extension's behavior and authentication were not changed.

## Live save verification — September 10, 2026

The user confirmed that saving a paper to a Scholar Inbox collection through the installed extension works. This supplements the automated save tests and earlier live lookup and collection-loading checks. The specific paper, collection, and confirmation message were not recorded.

## Multi-source identity checks — version 0.2.0

The same search/detail/collection endpoints are reused for all sources. Search results are ranked using title, author tokens, and publication year. A unique exact arXiv identifier (or DOI if returned by the service) can select a result automatically; a unique normalized title can also open the picker automatically, with a distinct **Title match** label. Similar or duplicate titles require a deliberate candidate selection. The observed search response exposes `arxiv_id` and `publication_date`, but does not currently expose `doi`, so DOI matching is conditional support rather than a verified API capability.

Candidate selection retrieves authenticated detail and checks the selected Scholar Inbox ID and normalized title, plus any known arXiv ID/DOI. Saving repeats these checks and checks current collection permissions and membership before the single write. The read-back validates the same identity and membership. A missing arXiv ID no longer prevents saving a user-selected, verified Scholar Inbox record.

Source metadata and PDFs are processed locally. Only the extracted/entered title is included in the Scholar Inbox search query. First-page PDF identifier hints are not used as exact-match evidence because they may identify a referenced paper.
