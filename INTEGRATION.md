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

## OpenReview source session — version 0.2.2

The reported PDF (`4vGVQVz5KG`) returned HTTP 403 anonymously, and its documented notes API returned `ChallengeRequiredError`. Source requests to HTTPS `openreview.net` / `www.openreview.net`, on `/forum` or `/pdf` with a valid note ID, now use `credentials: "include"` so Chrome can attach an existing verification/session cookie. Other source requests retain `credentials: "omit"`; redirects remain rejected. No cookie values are read and no API token or new host permission is introduced.

This follows [Chrome's extension cookie handling](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies). The user confirmed the previously failing PDF works with version 0.2.2. Persistent verification errors still offer the corresponding paper-page link and manual fallback.

## Popup loading — version 0.3.0

Resolve overlaps the sign-in check and collection fetch with paper lookup, returning account data only after all required reads succeed. A browser-session cache stores only the record mapping (IDs/slug, match type, and hashes of the query inputs and title), bounded to five minutes and 100 records. A hit still fetches fresh authenticated detail and current collections. Collections, memberships, permissions, and session responses are never cached. Save validation and write/read-back behavior are unchanged.

The bundled timing page can configure a baseline/optimized loading mode and clear the lookup cache. Its sender can invoke only that diagnostic operation; paper operations remain restricted to the popup. Session timing records contain durations, source category, version, result state and cache-hit status, with no titles, URLs, paper IDs, or account data. See [the comparison procedure](measurements/popup-loading.md) for the measurement boundary.

## Publisher preload warnings — version 0.3.1

The user reported an unused OpenReview CSS preload warning attributed to `popup.html`. A local Chrome reproduction isolated HTTP `Link: <...>; rel=preload; as=style` response headers: fetching the response from a document downloaded the stylesheet, whereas fetching the same response in a service worker did not. Parsing an HTML preload tag with the existing detached DOMParser did not download it in that reproduction.

Derived OpenReview and CVF landing-page downloads now run in the extension background worker. The popup still parses the returned HTML and automatically searches the extracted title. The worker accepts only source-plan-derived alternate pages on these supported hosts, retaining the existing size limit, redirect rejection and scoped OpenReview credentials. No new permissions are required. Automated tests cover routing, automatic matching, unsupported URLs and verification/PDF fallbacks; live installed-extension confirmation remains pending.


## Digest reader — version 0.6.0, September 30, 2026

The full-page reader reuses the existing session integration rather than requiring an API key. The current public [Scholar Inbox frontend](https://www.scholar-inbox.com/) API module and digest component expose the following read contract:

- `GET /` returns the default digest. `GET /?date=MM-DD-YYYY` selects a day; `p=1` is the second batch, with subsequent integer pages.
- `digest_df` contains paper records; `from_date` / `to_date` describe the selected range. The reader also accepts the older `current_digest_date` field. `prev_date`, `next_date`, and `has_more_papers_in_digest` control navigation.
- The reader shows daily digests. If the default response spans a range, it requests the final day before displaying/paging it.
- Paper detail at `GET /papers/{slug}` exposes `teaser_figures` (`imageUrl`, `caption`, `figureNumber`, `figureType`) and `first_page_image.imageUrl`. Image paths resolve against the website origin, not the API origin.

The reader checks the current session before each digest/detail operation and validates enriched records against both paper ID and slug. Only its exact extension page can call the digest worker routes; that page cannot call save, lookup, or diagnostic routes. Responses discard personal fields unrelated to rendering. Images are restricted to public Scholar Inbox figure/first-page paths for the corresponding paper ID. No credentials are read, API keys stored, or permissions added.

Abstracts are used directly. Missing abstracts/figures trigger lazy detail reads with concurrency capped at two. Account-dependent content remains in page memory; appearance settings and existing popup diagnostics/cache are separate. The reader performs no collection writes, ratings, read markers, notifications, or scheduled polling.

The contract and real public figure rendering were checked; authenticated retrieval through the installed extension and live date pagination are **not yet verified**. Automated tests exercise mocked responses and must not be interpreted as live account verification. The official API review above remains historical context.
