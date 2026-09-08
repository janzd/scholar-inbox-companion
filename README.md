# Scholar Clipper — collection-saving prototype

A local Chrome extension that saves the arXiv paper you are viewing to an existing Scholar Inbox collection. Version 0.1.1 focuses on saving; the richer digest reader is the next component and is not included yet.

## Install in Chrome

1. Open `chrome://extensions` in the Chrome profile where you use Scholar Inbox.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this package’s **extension** folder (the folder containing `manifest.json`).
4. Pin **Scholar Clipper** using Chrome’s extensions menu.
5. Stay signed in to Scholar Inbox in this profile. Open an arXiv abstract, HTML, or PDF page and click Scholar Clipper.
6. Check the title, choose a collection, and click **Save to [collection]**. A successful save is checked against fresh Scholar Inbox membership data.

Do not select the package’s parent folder when loading the extension. To update later, replace the files and click the extension’s Reload button at `chrome://extensions`.

## How it works

The extension gets the arXiv ID from the current tab’s URL and reads the title from that paper’s abstract page. It searches Scholar Inbox by title and accepts only a result with exactly the same arXiv ID (ignoring version suffixes). After checking sign-in, it loads your collections in parallel with the title search and matched-paper detail lookup. It waits for both branches before displaying the collection picker. Saving rechecks the paper identity, collection permission, and existing membership before making one add request, followed by a membership read-back.

If arXiv cannot provide metadata, you can enter the paper title. This does not relax the arXiv ID check. If Scholar Inbox has not indexed the paper, the extension will not save a different paper. Already-saved and read-only collections are shown but cannot be selected. It adds papers only to existing collections; it does not create, delete, rename, or share collections.

## Access and data

- **activeTab**: read the URL of the tab where you clicked the extension.
- **arxiv.org**: read the corresponding public abstract page.
- **api.scholar-inbox.com**: search papers and use your signed-in session to read collections and save your selected paper.

The extension uses browser-managed session cookies through `fetch` with `credentials: include`. It does not read cookie values, request the cookies permission, collect passwords, create API/MCP keys, or store credentials or browsing history. There is no server to host, analytics, AI API, remote executable code, or npm dependency. Data used for matching and the paper you choose to save are sent to Scholar Inbox. Sessions are separate across Chrome profiles.

## Status and limitations

- Verified against Scholar Inbox’s public frontend request definitions and live public paper responses in September 2026.
- Public title lookup returned arXiv `2609.04649` with paper ID `4842939`. ID-only search did not return it; the extension therefore searches by title and checks the returned ID.
- The signed-in collection picker and figure viewer were inspected in the website.
- All 14 automated tests pass. They cover exact ID matching, duplicate handling, permission checks, stale IDs, session loss, rate limits, uncertain saves, and correct binding of the browser fetch function.
- **Installed and enabled in the Chrome profile used for Scholar Inbox.** Live testing on September 9, 2026 verified automatic arXiv title retrieval, exact ID matching, the existing signed-in session, authenticated paper details, and loading all 16 collections. Last Visited Papers is correctly marked read-only. The live test exposed a browser fetch receiver bug, which was fixed and covered by a regression test.
- **A real add/read-back save has not yet been tested.** No paper was added to your real collections during development or the installation test.
- Uses the website’s current session API, not a documented extension integration contract; future website changes may require adjustments. Public frontend inspection also revealed an API/MCP settings page, but access keys were not created or retrieved.
- Search considers the first 20 title results. A missing exact match stops the operation rather than guessing.
- If the save cannot be confirmed, it may have succeeded. Check the Scholar Inbox paper link before retrying. The extension never automatically repeats an uncertain write.

## Checks

With Node.js 22 or newer, run `npm test` in this package. No install step is required. `INTEGRATION.md` records the endpoint contract used by the prototype.

## Development

This directory is the Git repository root. The `extension/` directory is also the unpacked extension currently loaded into Chrome; keeping it here preserves that installation path.

- `extension/`: browser extension source, including the read-only timing comparison page.
- `tests/`: Node.js tests with mocked network responses.
- `measurements/`: recorded live timing results and methodology.
- `INTEGRATION.md`: observed internal endpoints and the official API review.

Run `npm run check` and `npm test` before committing code changes. No dependency installation or build step is required. After editing extension files, use **Reload** on Scholar Clipper at `chrome://extensions`, then reopen its popup. Git starts on the `main` branch; use a feature branch for further work.

Keep credentials, local configuration, downloaded inspection material, and generated archives out of commits. `.gitignore` excludes common local and generated files. The repository contains no API keys; authentication currently uses Chrome's existing Scholar Inbox session.

For a local UI preview, serve `extension/` with a static server and open `popup.html?preview=1`. The preview clearly labels its example collections and cannot save anything.

## Version 0.1.1 — parallel lookup

Collection loading now overlaps the title search and paper detail request, after the sign-in check. The save path retains its existing checks and read-back sequence. Added tests verify that both lookup branches run concurrently, the UI result waits for both, and collection failures reject the lookup. Reloaded in Chrome and verified live exact-ID matching and all 16 collections. A six-run authenticated comparison measured median request-flow times of 1,655 ms sequential and 1,355 ms parallel (300 ms / 18.1% lower). See `measurements/README.md` for raw results and limitations; popup startup and rendering are excluded.
