# Lookup timing comparison — September 9, 2026

The median request-flow time fell from **1,655 ms sequential to 1,355 ms parallel**, a **300 ms (18.1%) reduction**.

Measured in the installed Chrome extension using the existing signed-in Scholar Inbox session and arXiv paper 2609.04649. Three runs per mode, with order S/P/P/S/S/P to reduce simple order bias. Each run returned the exact paper and 16 collections. No save requests were made.

| Run | Mode | Total ms | arXiv ms | Login ms | Search ms | Details ms | Collections ms |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | sequential | 2169 | 14 | 809 | 489 | 537 | 305 |
| 2 | parallel | 1396 | 12 | 301 | 494 | 588 | 302 |
| 3 | parallel | 1342 | 12 | 304 | 490 | 534 | 306 |
| 4 | sequential | 1650 | 11 | 311 | 492 | 530 | 305 |
| 5 | sequential | 1655 | 16 | 303 | 488 | 543 | 303 |
| 6 | parallel | 1355 | 12 | 305 | 496 | 539 | 307 |

Request durations include response parsing. Total also includes arXiv title parsing. Parallel request durations overlap, so they should not be summed to derive its total.

Across all six runs, median stage times were: arxiv: 12 ms, login: 304.5 ms, search: 491 ms, details: 538 ms, collections: 305 ms.

The collection request takes about 305 ms and fits entirely within the overlapping search/detail work. This explains the approximately 300 ms gain. Title search and paper detail retrieval remain the largest stages in the usual run. The first sequential login check was slower (809 ms versus roughly 300 ms thereafter); the medians reduce its influence.

These are request-flow measurements from a diagnostic extension page, not click-to-render measurements of the toolbar popup. They exclude popup creation, service-worker startup, extension messaging, and UI rendering. Browser/server caches were not cleared; arXiv metadata was retrieved very quickly in these repeated runs and may be slower for a different paper or a cold cache. This small, single-paper comparison is not a guarantee for every lookup.

To repeat, open the installed extension’s `benchmark.html` page and click Run comparison. It uses the same `ScholarClient.lookup` with the default parallel branch or the retained sequential comparison branch. No credentials are included in the results.
