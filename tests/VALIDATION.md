# Multi-source saving validation

Version 0.2.2, September 10, 2026. Related issue: [#2](https://github.com/janzd/scholar-inbox-companion/issues/2).

## Completed checks

- `npm run check` and `npm test`: original arXiv regressions, source URL plans, citation extraction, CVF/OpenReview selector fixtures, candidate ranking/selection, identity conflicts, collection permissions, duplicate prevention, uncertain writes, streamed download limits, PDF parsing, and popup interactions with mocked extension/network APIs.
- Live [CVF paper page](https://openaccess.thecvf.com/content/CVPR2024/html/Huang_Segment_and_Caption_Anything_CVPR_2024_paper.html): verified `citation_title`, author/date tags, PDF URL, and `#papertitle`. The real page was successfully read by the extractor.
- Its public 10.1 MB PDF: bundled PDF.js extracted **Segment and Caption Anything** and the author list. Verified both under Node and in the browser with `script-src 'self'; object-src 'self'`, exercising the bundled worker without remote scripts or eval.
- Generated PDF fixtures exercise metadata titles, first-page text fallback, empty/scanned-like content, malformed files, and oversized inputs.
- PDF popup tests confirm automatic search after extraction, manual fallback for empty titles, and actionable reload instructions for stale background workers.
- Updated popup preview renders the paper title, Scholar Inbox link, collection picker, and editing action.

## User validation

The user reported successful tests on arXiv, OpenReview paper pages, CVF, and open PDFs in version 0.2.1. The exception was [this OpenReview PDF](https://openreview.net/pdf?id=4vGVQVz5KG), **Unsupervised Behavior Extraction via Random Intent Priors**: Chrome displayed it, while the extension returned HTTP 403.

Anonymous requests to that PDF reproduced the 403; the documented notes API also returned `ChallengeRequiredError` with “Challenge verification required.” The extension previously omitted all source cookies. Version 0.2.2 lets Chrome attach existing cookies only for HTTPS OpenReview paper/forum routes. This does not read cookie values or add host permissions. Other source requests continue to omit credentials, and all source redirects remain disallowed.

All 38 automated tests pass, including credential scoping, the OpenReview PDF fallback after a failed forum fetch, and the recovery link when verification still fails. The user subsequently confirmed that the previously failing OpenReview PDF works with version 0.2.2. This completes the outstanding live source check.

Live validation was performed by the user in the installed Chrome extension.

## Deliberate limitations

A unique normalized title opens authenticated paper detail and the collection picker automatically. Title/author/year similarity ranks other candidates; duplicate or merely similar titles require selection. Exact arXiv IDs or DOI fields, when exposed by both sources, can select a unique record. Conflicting known identifiers exclude a result. PDF first-page identifiers are extracted as hints only: a referenced paper's identifier must not override a reviewed title.

Downloads omit cookies except for the scoped OpenReview session use above, reject redirects, and are restricted by the existing arXiv permission or the clicked tab's temporary origin permission. Login-only, redirected, cross-origin, scanned, or otherwise unreadable files have a manual-title/downloaded-file fallback. No new broad host permissions, OCR, PDF upload, or record-import workflow is included.
# Theme support — version 0.4.0

- `npm run check` and all 55 automated tests pass. Theme tests cover synchronous initialization, the System default, explicit overrides, persisted selection in fresh popup contexts, system appearance changes, cross-page updates, invalid values and unavailable storage.
- Palette checks verify at least 4.5:1 contrast for text, muted text, links and status/button labels on their intended backgrounds, and at least 3:1 for focus indicators.
- A local Chrome preview exercised paper/collection, loading, candidate, manual/PDF, error, success, warning and empty-collection states in both themes (16 combinations). All rendered within the 440 px popup width. The labeled selector retained each choice across page reloads, and the saved palette was applied before body parsing. The collection preview includes already-saved and read-only rows.
- Installed-extension reload, browser-restart persistence and an actual OS appearance toggle remain for user confirmation; automated tests cover the storage and media-query behavior. No account writes were made during theme validation.
