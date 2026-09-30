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


# Options and palettes — version 0.5.0

- Syntax checks and all 58 automated tests pass. New checks cover independent palette/mode persistence, upgrade defaults, cross-page updates, invalid preferences, blocked storage and the full-tab Options declaration. Text contrast and focus contrast pass for both modes of both palettes.
- Local Chrome checks passed for 40 page/palette/mode combinations: eight popup states, Settings and the timing page, each with Blue/Scholar Inbox and Light/Dark. Settings fits at 360 and 760 px; popup content fits at 440 px with the icon switch still centered.
- Real browser storage events propagated Settings changes to the open popup preview. Reloads restored both preferences, and both applied before body parsing.
- The installed extension's native right-click Options entry still needs user confirmation after reloading. Chrome's documented `options_ui` registration supplies this entry; no custom context-menu permission is used. Browser restart and actual OS theme-toggle checks were not performed in this validation.


# Rich digest reader — version 0.6.0

- Unit tests cover calendar validation, website date/page parameters, default-range resolution, deduplication, missing figures, safe paper/image URLs, session requirements, detail identity checks, and worker route isolation. Existing popup/save tests remain in the suite.
- `npm run test:digest-ui` runs 39 browser checks with fixtures in a temporary Chrome profile: abstract/link rendering, figure navigation/enlargement/Escape, pagination deduplication, empty/error/signed-out/missing-image states, escaped titles, stale-date response handling, two-request detail concurrency, and both palettes/themes at 390/1280 px without horizontal overflow.
- Light/dark screenshots were inspected using the public ReaDiT Guidance record and its actual Scholar Inbox figure image. No account calls or writes were made for those previews.
- Pending user checks after reloading the extension: open Your digest while signed in, compare the returned daily papers with Scholar Inbox, select another date, load another page if offered, and confirm figure enrichment on papers missing initial figures.
- Store screenshots still represent version 0.5.0 and should be refreshed after reader UX approval, before publication. Release packaging/privacy work remains tracked in issue #10.


# Digest notifications — version 0.6.1

- 76 unit/regression tests pass, including hourly alarm restoration/throttling, availability checks, persistent per-account deduplication, old-date and cross-account acknowledgements, already-read suppression, disabling in-flight checks, coalescing, offline/logout behavior, permission/delivery failure, dated click destinations, bounded storage, and optional-permission event registration.
- 43 reader checks and 48 Settings checks pass in isolated Chrome with mocked extension APIs. The reader checks additionally cover dated notification URLs and acknowledgement only while visible. Settings checks exercise enabling/disabling, permission-denial rollback, manual checks, theme/palette application, and narrow layouts. No native notification was sent by these tests.
- Pending user verification after Reload: turn on desktop notifications in Settings and grant Chrome permission; run Check now while signed in; verify today's readiness signal, native banner delivery/click behavior, badge clearing, and continued checks after Chrome restarts. OS delivery and hourly behavior in the installed extension are not established by fixtures.
- Public-release permission/privacy descriptions and store screenshots must be refreshed for the notification feature before publishing (#10).
