# Scholar Inbox Companion

Save papers from research websites and PDFs directly to your [Scholar Inbox](https://www.scholar-inbox.com/) collections.

Scholar Inbox Companion is an unofficial Chrome extension that adds a collection picker to your browsing workflow. Open a paper, choose a collection, and save it without switching to Scholar Inbox to search for it again.

> **Early preview:** The user has tested arXiv, OpenReview paper pages, CVF, and open PDFs successfully. The OpenReview PDF verification fix in version 0.2.2 is also user-verified; see [validation notes](tests/VALIDATION.md).

## Features

- Choose Light, Dark, or System appearance, remembered across popup openings and browser restarts.
- Show the detected title immediately while lookup continues, and reuse recent record mappings on repeat opens.
- Recognize papers on arXiv, CVF Open Access, and OpenReview.
- Read scholarly citation metadata on other websites.
- Extract a title from public or downloaded PDFs locally, with manual correction.
- Search and choose from your existing Scholar Inbox collections.
- Match exact arXiv IDs (including versioned links), or DOI when available in Scholar Inbox.
- Open a unique matching title automatically; rank ambiguous candidates using title, authors, and year for you to choose.
- Show collections where the paper is already saved and disable read-only collections.
- Open the matched paper in Scholar Inbox.
- Use your existing Scholar Inbox login—no separate account or API key setup.

## Installation

You need Chrome and a Scholar Inbox account. Node.js is only needed for development.

1. Clone this repository, or use GitHub’s **Code → Download ZIP** and extract it:

   ```sh
   git clone https://github.com/janzd/scholar-inbox-companion.git
   ```

2. Open `chrome://extensions` in the Chrome profile where you use Scholar Inbox.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository’s **`extension`** folder—the one containing `manifest.json`.
5. Pin **Scholar Inbox Companion** from Chrome’s extensions menu for easy access.

No build step or dependency installation is required. Keep the extension folder in place while it is installed.

## Usage

1. Sign in to Scholar Inbox in the same Chrome profile.
2. Open a paper page or PDF and click the extension’s toolbar icon.
3. Check the matched title. If candidate records appear, check their titles and authors and click **Use this paper**. Then select a collection. Use the filter to find a collection by name.
4. Click **Save to [collection]**. The extension checks the paper’s collection membership before showing a confirmed save.

The Scholar Inbox tab does not need to remain open. Use **Edit title / Search again** to correct a title. A unique exact identifier or normalized title match opens the collection picker automatically. Similar or duplicate titles require you to select a result.

For known PDF links, the extension first tries the associated paper page. Otherwise, it reads the PDF locally and automatically searches using the extracted title. Check the matched paper before saving; you can edit the title if extraction was inaccurate. If a PDF URL has no `.pdf` suffix, use **Read this tab as a PDF** in the fallback view. You can also choose a downloaded PDF or enter its title manually. Choosing a local file does not upload it.

### Appearance

Use **Theme** at the bottom of the popup to choose **Light**, **Dark**, or **System** (the default). System follows your operating system’s appearance, including changes while the popup is open. Your choice is saved locally in this Chrome profile and also applies to the timing page.

### Updating

If you cloned the repository, run `git pull --ff-only` from its folder. If you downloaded a ZIP, replace the extension files with the updated version. Then open `chrome://extensions`, click **Reload** on Scholar Inbox Companion, and reopen the popup.

## Privacy and permissions

Requests go directly to the current paper website, arXiv, and Scholar Inbox. There is no separate backend, analytics service, or AI service involved in the current extension.

| Permission | Purpose |
| --- | --- |
| `activeTab` | Temporarily access the tab you click on: read its URL and download public paper pages/PDFs from its origin. |
| `storage` | Keep a bounded record-lookup cache and timing diagnostics in browser-session memory. |
| `scripting` | Read scholarly metadata and the paper heading from that tab, on demand. |
| `https://arxiv.org/*` | Retrieve the paper’s public abstract page and title. |
| `https://api.scholar-inbox.com/*` | Find the paper, load your collections, and save to the collection you select. |

The appearance preference is stored in extension-local Web Storage and persists across browser restarts. It contains only `light`, `dark`, or `system` and is never sent to a website.

There is no persistent access to all websites and no background scanning of tabs. Page/PDF downloads do not follow redirects. Downloads normally omit credentials; HTTPS OpenReview `/forum?id=…` and `/pdf?id=…` requests let Chrome attach the existing OpenReview session and browser-verification cookies. The extension does not read or copy cookie values, and this exception adds no host or cookie permissions. PDFs are capped at 25 MB with a 20-second download timeout and a 12-second parsing timeout; extraction examines document metadata and the first page. PDF.js and its worker are bundled, with no remote scripts or AI processing.

Chrome supplies the existing Scholar Inbox session cookie with authenticated requests. The extension does not read cookie values or store passwords or API keys. The paper title is sent to Scholar Inbox for matching; saving sends the matched paper and selected collection identifiers.

## Popup loading

Version 0.3 reads metadata directly from an open arXiv page where possible and shows the detected title before Scholar Inbox finishes loading. Sign-in, search/detail retrieval, and collection loading overlap.

A five-minute cache (up to 100 entries) remembers resolved paper IDs and slugs, stable identifiers, match type, and hashes of the search inputs and matched title. It lives in `chrome.storage.session`, survives service-worker restarts, and is cleared when the extension or browser restarts. Collections, permissions, memberships, login responses, PDFs, and raw source metadata are never cached. Every open fetches current account data and validates the paper detail; every save still performs fresh identity, permission, and membership checks. **Retry** and **Search Scholar Inbox** bypass the mapping cache.

The timing page (`benchmark.html` in the installed extension) records up to 20 opens using timings and source categories only. Its diagnostic baseline mode allows comparison with the prior loading sequence on the same build. See [the performance report](measurements/popup-loading.md) for measurements, limitations, and the live comparison procedure. Leave the timing page in **optimized** mode for normal use.

## Limitations and troubleshooting

- **OpenReview verification:** If OpenReview still refuses a PDF, use **Open paper page** in the popup, complete any verification or sign-in requested by OpenReview, then retry. Cookie-blocking settings or an expired verification may still require manual title entry.
- **Site restrictions:** Login-protected PDFs, browser-verification pages, and restricted browser pages may require manual title entry or choosing a downloaded PDF. If a PDF link redirects, open the final URL and reopen the extension. Cross-origin PDF links are not fetched automatically.
- **PDF extraction is approximate:** Scanned PDFs, missing metadata, and unusual layouts may need a corrected title. OCR is not included. Local `file://` tabs use manual entry or the file chooser rather than broad filesystem access.
- **Existing collections only:** Create or manage collections in Scholar Inbox.
- **No match found:** Check the title. The paper may not be indexed in Scholar Inbox, or it may be outside the first 20 title-search results. Records with conflicting known identifiers are excluded. The extension cannot import an unindexed paper.
- **Reload required / Unknown request:** After updating the files, click **Reload** on Scholar Inbox Companion at `chrome://extensions`. Merely reopening the popup can leave the previous background worker running.
- **Sign-in required:** If your session expires, sign in to Scholar Inbox in the same Chrome profile and retry.
- **Unconfirmed save:** The request may have succeeded. Check the paper’s Scholar Inbox page before retrying; uncertain writes are never retried automatically.

The extension currently uses Scholar Inbox’s internal website API. Changes to that API may require updates to the extension.

## Planned

A richer digest reader with abstracts or contribution summaries, figures, and links to the paper and Scholar Inbox. This is not included in the current version.

## Development

Requires **Node.js 22.13 or newer**. Development dependencies provide PDF.js and a DOM test environment.

```sh
npm ci
npm run check
npm test
```

Load `extension/` unpacked in Chrome, edit the source, and reload the extension to test changes. PDF.js 6.3.289 compatibility builds are committed in `extension/vendor/`, so installation still requires no build. To reproduce those files after `npm ci`, run `npm run vendor:pdf`; keep the [third-party license](extension/vendor/PDFJS-LICENSE) with them. Automated tests use mocked network responses and do not modify a Scholar Inbox account.

| Path | Contents |
| --- | --- |
| [`extension/`](extension/) | Extension source and a read-only timing comparison page. |
| [`tests/`](tests/) | Tests for matching, permissions, save confirmation, errors, and parallel loading. |
| [`INTEGRATION.md`](INTEGRATION.md) | Internal endpoint notes and the official API review. |
| [`measurements/`](measurements/) | Lookup timing results and methodology. |

For a UI-only preview, serve `extension/` with a local static server and open `popup.html?preview=1`. It displays example collections and cannot save papers. Add `&view=loading`, `&view=candidates`, `&view=manual`, `&view=error`, `&view=success`, `&view=warning`, or `&view=empty` to inspect other states. Use the Theme selector to inspect either palette. Preview preferences are separate from the installed extension.
