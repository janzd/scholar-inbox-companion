# Scholar Inbox Companion

Save papers from arXiv directly to your [Scholar Inbox](https://www.scholar-inbox.com/) collections.

Scholar Inbox Companion is an unofficial Chrome extension that adds a collection picker to your browsing workflow. Open a paper, choose a collection, and save it without switching to Scholar Inbox to search for it again.

> **Early preview:** Paper lookup and collection loading have been verified with a signed-in account. Saving is implemented and covered by automated tests, but a real save and its confirmation have not yet been verified end to end.

## Features

- Recognize papers on arXiv abstract, HTML, and PDF pages.
- Search and choose from your existing Scholar Inbox collections.
- Match papers by their exact arXiv ID, including versioned links.
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
2. Open an arXiv paper and click the extension’s toolbar icon.
3. Check the matched title, then select a collection. Use the filter to find a collection by name.
4. Click **Save to [collection]**. The extension checks the paper’s collection membership before showing a confirmed save.

The Scholar Inbox tab does not need to remain open. If the extension cannot read the title from arXiv, you can enter it manually; the result must still match the exact arXiv ID.

### Updating

If you cloned the repository, run `git pull --ff-only` from its folder. If you downloaded a ZIP, replace the extension files with the updated version. Then open `chrome://extensions`, click **Reload** on Scholar Inbox Companion, and reopen the popup.

## Privacy and permissions

Requests go directly to arXiv and Scholar Inbox. There is no separate backend, analytics service, or AI service involved in the current extension.

| Permission | Purpose |
| --- | --- |
| `activeTab` | Read the current tab’s URL when you click the extension. |
| `https://arxiv.org/*` | Retrieve the paper’s public abstract page and title. |
| `https://api.scholar-inbox.com/*` | Find the paper, load your collections, and save to the collection you select. |

Chrome supplies the existing Scholar Inbox session cookie with authenticated requests. The extension does not read cookie values or store passwords, API keys, or browsing history. The paper title is sent to Scholar Inbox for matching; saving sends the matched paper and selected collection identifiers.

## Limitations and troubleshooting

- **arXiv only:** Other paper websites are not supported yet.
- **Existing collections only:** Create or manage collections in Scholar Inbox.
- **No match found:** Check the title. The paper may not be indexed in Scholar Inbox, or it may be outside the first 20 title-search results. The extension will not substitute a different arXiv ID.
- **Sign-in required:** If your session expires, sign in to Scholar Inbox in the same Chrome profile and retry.
- **Unconfirmed save:** The request may have succeeded. Check the paper’s Scholar Inbox page before retrying; uncertain writes are never retried automatically.

The extension currently uses Scholar Inbox’s internal website API. Changes to that API may require updates to the extension.

## Planned

A richer digest reader with abstracts or contribution summaries, figures, and links to the paper and Scholar Inbox. This is not included in the current version.

## Development

Requires **Node.js 22 or newer**. There are no npm dependencies to install.

```sh
npm run check
npm test
```

Load `extension/` unpacked in Chrome, edit the source, and reload the extension to test changes. Automated tests use mocked network responses and do not modify a Scholar Inbox account.

| Path | Contents |
| --- | --- |
| [`extension/`](extension/) | Extension source and a read-only timing comparison page. |
| [`tests/`](tests/) | Tests for matching, permissions, save confirmation, errors, and parallel loading. |
| [`INTEGRATION.md`](INTEGRATION.md) | Internal endpoint notes and the official API review. |
| [`measurements/`](measurements/) | Lookup timing results and methodology. |

For a UI-only preview, serve `extension/` with a local static server and open `popup.html?preview=1`. It displays example collections and cannot save papers.
