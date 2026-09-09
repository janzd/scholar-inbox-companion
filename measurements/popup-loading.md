# Popup loading improvements — issue #1

Version 0.3.0, September 10, 2026. The implementation is ready for installed-Chrome validation. All 49 automated tests pass.

## Controlled before/after measurement

| Open | Before: title visible | After: title visible | Before: picker usable | After: picker usable |
| --- | ---: | ---: | ---: | ---: |
| First (empty mapping cache) | 1,365 ms | 11 ms | 1,365 ms | 1,046 ms |
| Repeat (same paper) | 1,362 ms | 11 ms | 1,363 ms | 555 ms |

These medians represent **23.4% faster first opens** and **59.3% faster repeat opens in the controlled scenario**, not measured improvements in the installed Chrome extension.

The real popup and client modules run in linkedom with identical simulated I/O delays. The baseline is commit `74f81fc` (version 0.2.2). Three first/repeat pairs per version, alternating version order across rounds. Each first open uses an empty application mapping cache; each repeat reuses that client's cache. Script/module startup, document construction, extension-message simulation, and DOM updates are included. Chrome process startup, toolbar-click handling, actual service-worker startup, layout/painting, and real network requests are excluded.

Scholar Inbox delays use the earlier live report's approximate stage medians: session 305 ms, search 491 ms, details 538 ms, collections 305 ms. Source download uses 12 ms; simulated tab lookup and injection use 3 ms each, and messaging uses 2 ms. These are fixed delays, not new live measurements; the source delay does not represent an uncached large PDF download.

Raw runs: [popup-controlled.json](popup-controlled.json). Reproduce after `npm ci`:

```sh
npm run measure:popup
```

The baseline makes five requests per open (source, session, search, collections, detail). Optimized arXiv HTML/abstract opens make four on first lookup, then three on a repeat: the open tab supplies metadata, and the mapping cache skips search. Sign-in and collection requests overlap the search/detail path. Cache hits still fetch authenticated detail and current collections.

## Installed toolbar-popup comparison

Live before/after timings remain to be collected. The extension records up to 20 popup opens in browser-session memory. Open `benchmark.html` inside the installed extension (use its ID from Chrome's extension Details page: `chrome-extension://EXTENSION_ID/benchmark.html`).

1. Reload version 0.3.0 and open the timing page. Choose **Use baseline loading**. This clears the record cache and restores the pre-0.3 sequence and display behavior in the current build; it is a behavioral baseline, not the old binary.
2. On one arXiv abstract page, open the toolbar popup and wait for the collection picker. Close and reopen it once for a repeat measurement.
3. Choose **Use optimized loading**, which clears the cache again, and repeat the same two opens on the same paper.
4. Collect at least three pairs in each mode, alternating order. Return to the timing page and click **Refresh popup timings** to retrieve the JSON. Leave optimized mode enabled afterward.

Both modes use the same clock: `performance.now()` from popup document navigation. `metadataMs` records the first title DOM update, and `usableMs` records the usable paper/picker or candidates after two animation frames. Script loading, storage reads, extension messaging, any worker startup encountered by the message, network requests, and painting are included. The toolbar click-to-document-creation interval is **not** measured; do not describe these numbers as complete click-to-popup latency. The record includes mode, version, source category, result state, and cache-hit flag, but no paper title, URL, identifiers, or account details.

The first/repeat comparison concerns an empty versus valid application cache. Browser/server caching and worker scheduling can vary; keep the same paper/account and record failures separately. Reloading clears session storage, so export the JSON before reloading if retaining results.

## Correctness and limitations

- Only resolved record identifiers, match type, and hashes of lookup inputs/title are cached, for five minutes and at most 100 entries. Session storage survives worker restarts and clears on extension/browser restart.
- Collections, membership, permissions, account sessions, source-page metadata, and PDFs are never cached. Sign-out cannot expose an old picker. Account changes get fresh collections and membership. Storage failures fall back to a normal lookup.
- Cached records are validated with fresh detail. Changed or missing records can trigger one new search; authentication/network failures do not cause automatic retries. Explicit Retry and manual search bypass the cache.
- Saves continue to fetch current identity, permissions, and membership, make at most one write, and read back confirmation.
- Generic PDFs may still need downloading and parsing each time. The mapping cache removes Scholar Inbox search work, not source download latency.
- Local UI preview verified the early title/authors and hidden collection picker while lookup is pending. Installed-Chrome timing and user experience checks remain outstanding.
