# Multi-source saving validation

Version 0.2.0, September 10, 2026. Related issue: [#2](https://github.com/janzd/scholar-inbox-companion/issues/2).

## Completed checks

- `npm run check` and `npm test`: original arXiv regressions, source URL plans, citation extraction, CVF/OpenReview selector fixtures, candidate ranking/selection, identity conflicts, collection permissions, duplicate prevention, uncertain writes, streamed download limits, PDF parsing, and popup interactions with mocked extension/network APIs.
- Live [CVF paper page](https://openaccess.thecvf.com/content/CVPR2024/html/Huang_Segment_and_Caption_Anything_CVPR_2024_paper.html): verified `citation_title`, author/date tags, PDF URL, and `#papertitle`. The real page was successfully read by the extractor.
- Its public 10.1 MB PDF: bundled PDF.js extracted **Segment and Caption Anything** and the author list. Verified both under Node and in the browser with `script-src 'self'; object-src 'self'`, exercising the bundled worker without remote scripts or eval.
- Generated PDF fixtures exercise metadata titles, first-page text fallback, empty/scanned-like content, malformed files, and oversized inputs.
- Updated popup preview renders the paper title, Scholar Inbox link, collection picker, and editing action.

## Checks still needed in the installed Chrome extension

The existing arXiv save workflow was user-verified before this change. These new source paths have not yet been tested against the user's authenticated account in an installed version 0.2.0.

- Reload/load version 0.2.0 and confirm the new `scripting` permission is available.
- Open a CVF paper page and its PDF; select the correct record and save to a chosen collection. Reopen from the other URL and check **Already saved**.
- Open an OpenReview forum and its PDF in a browser where its verification check has completed. The representative [OpenReview page](https://openreview.net/forum?id=YicbFdNTTy) returned a verification screen during live inspection, so the rendered `h2.citation.title` selector is fixture-tested, not live-verified in this environment.
- Try a generic public PDF, an extensionless PDF URL, and a downloaded PDF. Review/correct the proposed title and select the intended Scholar Inbox record.
- Recheck a versioned arXiv URL and an expired Scholar Inbox session.

Chrome's extension-management UI was blocked to browser automation earlier in this task. Loading/reloading the installed extension remains a manual step; the local web preview does not prove Chrome's temporary host grants or extension installation behavior.

## Deliberate limitations

Title/author/year similarity ranks candidates but never automatically selects one. Exact arXiv IDs or DOI fields, when exposed by both sources, can select a unique record. Conflicting known identifiers exclude a result. PDF first-page identifiers are extracted as hints only: a referenced paper's identifier must not override a reviewed title.

Downloads omit cookies, reject redirects, and are restricted by the existing arXiv permission or the clicked tab's temporary origin permission. Login-only, redirected, cross-origin, scanned, or otherwise unreadable files have a manual-title/downloaded-file fallback. No new broad host permissions, OCR, PDF upload, or record-import workflow is included.
