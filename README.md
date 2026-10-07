# Scholar Inbox Companion

Save papers from research websites and PDFs to your [Scholar Inbox](https://www.scholar-inbox.com/) collections, and browse your daily digest with abstracts and figures.

Scholar Inbox Companion is an unofficial Chrome extension that adds a collection picker to your browsing workflow. Open a paper, choose a collection, and save it without switching to Scholar Inbox to search for it again.

> **Early preview:** The user has tested arXiv, OpenReview paper pages, CVF, and open PDFs successfully. The OpenReview PDF verification fix in version 0.2.2 is also user-verified; see [validation notes](tests/VALIDATION.md).

## Features

- Check for today’s digest every 60 minutes, with a NEW badge and optional desktop alerts.
- Open your personalized daily digest in a full-page reader, with abstracts, figure galleries, captions, and links to the paper and Scholar Inbox.

- Choose Light, Dark, or System appearance and a Blue or Scholar Inbox color palette, remembered across popup openings and browser restarts.
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

### Your digest

Click **Your digest** at the bottom of the popup to open the full-page reader. It uses your existing Scholar Inbox login. Choose a date, browse available previous/next digests, or use **Latest** to open the service’s default digest date. If Scholar Inbox returns a saved date range, Latest opens its final day. Use **Load more papers** when additional results are available.

Each paper shows its abstract and the figures Scholar Inbox provides. Click a figure to enlarge it, use the arrows to browse figures and tables, and expand long captions. Missing details load as cards approach the viewport, with at most two detail requests in progress. If figures are unavailable, the reader shows a labeled first-page preview when available, or an explicit missing-figure message.

The relevance badge matches Scholar Inbox’s displayed score, with an explicit unavailable state when no score is supplied. Papers keep the ordering returned by Scholar Inbox.

Use **Like** or **Dislike** to submit feedback directly from the reader. Click the selected rating again to remove it. Controls show success only after the extension checks the account/paper, submits once, and reads the current rating back. If the outcome is uncertain, use **Refresh rating** to check without submitting again. A changed account requires reloading the digest. Browsing alone does not submit ratings or mark papers read in Scholar Inbox.

Installed-account retrieval, date navigation, and rating writes still need live user verification; automated tests use fixtures. No generated summaries or collection-saving controls are included in the reader.

### Digest notifications

Hourly checks are on by default. A **NEW** badge appears when a non-empty personalized digest for today (UTC) is available. Opening that date in a visible reader clears the badge. Opening an older date or a background tab does not clear it prematurely.

For desktop alerts, open **Settings → Digest notifications** and enable **Also show desktop notifications**. Chrome asks for optional notification permission. Click an alert to open the announced digest date. Desktop alerts contain no paper titles or account names, and each date is announced at most once per account. No alerts are sent for a date you have already opened in the reader.

Settings also lets you turn hourly checks off, run **Check now**, and see the last check result. Checks run at browser startup and approximately every 60 minutes while Chrome is running. Sleep, scheduling delays, and Chrome/system notification settings can delay or suppress desktop alerts. Signed-out and failed requests are retried at the next check without error notifications.

Availability is inferred from a non-empty response explicitly dated today. The website API does not expose a verified generation-complete or email-delivery signal, so notifications may arrive at a different time from email and do not guarantee the entire digest has finished populating.

### Discord setup (optional)

Open **Settings → Discord notifications** and choose a destination:

- **Channel webhook:** in a Discord text channel you manage, open **Edit Channel → Integrations → Webhooks**, create a webhook and copy its URL into Settings. Forum/media channels and thread-specific webhooks are not supported by this setup.
- **Direct message:** create a bot in the [Discord Developer Portal](https://discord.com/developers/applications), install it in a server you share, and copy its Bot token into Settings. In Discord, enable **User Settings → Advanced → Developer Mode**, then right-click your profile and copy your user ID. Your privacy settings must permit the bot's DM. Only bot tokens are supported; no message-history access or privileged intents are required for these outgoing notices.

Enable delivery, save, and grant optional access to `discord.com`. Keep hourly checks enabled. Saving does not send a test message; **Check now** or the next hourly check can notify for an unread digest that has not already been attempted. Slack and Discord can both be enabled and have separate daily attempt records. Opening a digest suppresses subsequent notifications for that date.

Discord sends only a generic digest notice and website link, with mentions and link embeds disabled. Webhooks use `wait=true` for server confirmation. Failed or uncertain attempts are not automatically retried for the same date, including after replacing credentials. Status is shown when Settings opens; reopen Settings after checking to see the updated delivery result.

Credentials stay in trusted local extension storage, not synced or encrypted by the extension, and are never returned to Settings. Leaving a secret field blank keeps the saved value; switching methods replaces the connection. Remove connection deletes the secret, but does not revoke Chrome's optional host permission. Live Discord delivery still requires user verification; automated tests use fixtures.

### Slack setup (optional)

For direct messages, choose **Settings → Slack notifications → Direct message**. Install a Slack app with the `chat:write` and `im:write` bot scopes, then enter its Bot User OAuth Token (`xoxb-…`) and your Slack member ID. Enable delivery and save, granting optional access to `slack.com` when Chrome asks. The extension opens a DM with your bot and posts the digest notice there; it does not request message history permissions. Keep the token private. It is stored locally in trusted extension storage, not synced or encrypted by the extension, and is never returned to Settings. Blank token fields keep the saved token; changing delivery methods replaces the connection.


Slack delivery is off until you configure and enable it under **Settings → Slack notifications**. Create an incoming webhook for the intended Slack channel using [Slack’s setup instructions](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/); your workspace may require app approval. Paste its URL into Settings and save. Saving with delivery off sends nothing. The webhook's destination is chosen in Slack; OAuth installation is not implemented.

Enabling delivery asks Chrome for optional access to `hooks.slack.com` and binds the connection to the currently signed-in Scholar Inbox account. Leave hourly checks enabled. Future hourly checks or **Check now** can send one generic notice per unread digest date/account, containing the date and a Scholar Inbox website link. No titles, abstracts, figures, account names, or extension-local links are included. Reader, badge, and desktop notifications continue to work without Slack.

The webhook URL is a secret stored in `chrome.storage.local`, restricted to trusted extension contexts. It is not synced or encrypted by the extension, and is never returned to the Settings page after saving or included in logs/errors. **Remove webhook** deletes it and disables delivery. A blank field preserves a saved webhook. Disable and re-enable delivery while signed into another account to change the account binding.

An attempt receipt is saved before posting. Failed or uncertain posts are not automatically retried for that date, even after restarting or replacing the webhook; check Slack before assuming a message failed. Slack delivery has only been tested with mocked requests. No real webhook has been configured or message sent during development.

### Appearance

Use the centered icon switch at the bottom of the popup: **sun** for Light, **moon** for Dark, and **monitor** for System (the default). System follows your operating system’s appearance, including changes while the popup is open. Right-click the extension’s toolbar icon and choose **Options** to open Settings in a new tab. You can also use the Settings icon beside the popup’s theme switch.

Settings offers **Blue** and **Scholar Inbox** color palettes, each with light and dark variants. Palette and appearance mode are independent. Changes save automatically in this Chrome profile and apply to the popup, digest reader, Settings, and timing page. Blue remains the default, and updating preserves your existing appearance mode.

### Updating

If you cloned the repository, run `git pull --ff-only` from its folder. If you downloaded a ZIP, replace the extension files with the updated version. Then open `chrome://extensions`, click **Reload** on Scholar Inbox Companion, and reopen the popup.

## Privacy and permissions

Requests go directly to the current paper website, arXiv, and Scholar Inbox, plus Slack or Discord only when their delivery is configured and enabled. There is no separate backend, analytics service, or AI service involved in the current extension.

| Permission | Purpose |
| --- | --- |
| `activeTab` | Temporarily access the tab you click on: read its URL and download public paper pages/PDFs from its origin. |
| `storage` | Keep a bounded record-lookup cache and timing diagnostics in browser-session memory, plus notification preferences and bounded date/account receipts locally. |
| `alarms` | Schedule a check every 60 minutes while enabled. |
| `https://discord.com/*` (optional) | Post to your configured Discord webhook or bot DM. |
| `https://slack.com/*` (optional) | Open the configured bot DM and post digest notifications using the bot token. |
| `https://hooks.slack.com/*` (optional) | Post generic digest notifications to the webhook you configure and enable. |
| `notifications` (optional) | Show desktop alerts only when enabled and permitted. |
| `scripting` | Read scholarly metadata and the paper heading from that tab, on demand. |
| `https://arxiv.org/*` | Retrieve the paper’s public abstract page and title. |
| `https://api.scholar-inbox.com/*` | Find papers, read your digest and paper details, submit ratings you select, load your collections, and save to the collection you select. |

Digest requests send the requested date and page to Scholar Inbox; detail requests send the paper slug. Digest content stays in the open reader’s memory and is cleared on navigation, refresh, or an authentication error. It is not added to the extension’s lookup cache or local storage. Images load directly from Scholar Inbox’s public figure/first-page paths and may use Chrome’s normal image cache. No extra host permission or API key is required. Hourly checks fetch only the first batch of today’s digest, without figures or detail enrichment; paper content from those checks is discarded.

Notification preferences, optional Slack and Discord configurations (including its secret webhook URL or bot token, recipient ID, and bound account hash), last-check status/timestamps, and date receipts for up to five accounts are stored in `chrome.storage.local`. Accounts are distinguished using a SHA-256 hash of the service’s username; no raw Scholar Inbox username, paper content, or Scholar Inbox credentials are stored there. The optional messaging credentials are the exceptions described above. This is a pseudonymous identifier, not an anonymity guarantee. Date receipts survive browser restarts to prevent duplicate alerts.

Appearance preferences are stored in extension-local Web Storage and persist across browser restarts. They contain only the mode (`light`, `dark`, or `system`) and palette (`blue` or `scholar`) and are never sent to a website.

There is no persistent access to all websites and no background scanning of tabs. Enabled hourly checks contact Scholar Inbox independently of the current tab. Page/PDF downloads do not follow redirects. Downloads normally omit credentials; HTTPS OpenReview `/forum?id=…` and `/pdf?id=…` requests let Chrome attach the existing OpenReview session and browser-verification cookies. The extension does not read or copy cookie values, and this exception adds no host or cookie permissions. PDFs are capped at 25 MB with a 20-second download timeout and a 12-second parsing timeout; extraction examines document metadata and the first page. PDF.js and its worker are bundled, with no remote scripts or AI processing.

Chrome supplies the existing Scholar Inbox session cookie with authenticated requests. The extension does not read cookie values or store passwords or API keys. The paper title is sent to Scholar Inbox for matching; saving sends the matched paper and selected collection identifiers. A reader rating sends the verified paper identifier and your chosen like, dislike, or removal value to Scholar Inbox.

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

## Development

GitHub Actions runs **Syntax and unit tests** and **Reader and Settings browser tests** on every pull request and push to `main`. Both checks use Node.js 22 and dependencies from the lockfile. Browser tests use Playwright-managed Chromium with mocked extension APIs and account responses; no credentials or live account writes are involved. Runs can also be started manually from the Actions tab once the workflow is on `main`.

To reproduce the CI browser setup locally, run `npx playwright install chromium`, then prefix each browser test command below with `DIGEST_TEST_BROWSER_CHANNEL=chromium` (Linux runners also need `--with-deps` when installing).

Requires **Node.js 22.13 or newer**. Development dependencies provide PDF.js, a DOM test environment, and icon/store asset export tooling.

```sh
npm ci
npm run check
npm test
npm run test:digest-ui
npm run test:alerts-ui
```

Load `extension/` unpacked in Chrome, edit the source, and reload the extension to test changes. PDF.js 6.3.289 compatibility builds are committed in `extension/vendor/`, so installation still requires no build. To reproduce those files after `npm ci`, run `npm run vendor:pdf`; keep the [third-party license](extension/vendor/PDFJS-LICENSE) with them. Automated tests use mocked network responses and do not modify a Scholar Inbox account. The digest browser checks launch installed Chrome in an isolated temporary profile. Set `DIGEST_TEST_BROWSER_CHANNEL` to another installed Playwright channel if necessary.

| Path | Contents |
| --- | --- |
| [`extension/`](extension/) | Extension source and a read-only timing comparison page. |
| [`assets/store/`](assets/store/) | Store screenshots, promotional tile, listing draft, and capture instructions. |
| [`assets/branding/`](assets/branding/) | Editable icon artwork and export instructions (`npm run icons:build`). |
| [`tests/`](tests/) | Tests for matching, permissions, save confirmation, errors, and parallel loading. |
| [`INTEGRATION.md`](INTEGRATION.md) | Internal endpoint notes and the official API review. |
| [`measurements/`](measurements/) | Lookup timing results and methodology. |

For a digest preview, serve `extension/` and open `digest.html?preview=1`. It uses one public example paper and loads its public figures from Scholar Inbox, with no account requests. Add `&view=empty`, `&view=missing`, `&view=error`, or `&view=signed-out` to inspect fallback states.

For a UI-only popup preview, serve `extension/` with a local static server and open `popup.html?preview=1`. It displays example collections and cannot save papers. Add `&view=loading`, `&view=candidates`, `&view=manual`, `&view=error`, `&view=success`, `&view=warning`, or `&view=empty` to inspect other states. Use the icon switch to inspect either palette. Preview preferences are separate from the installed extension.
