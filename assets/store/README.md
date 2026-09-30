# Chrome Web Store assets

Prepared for issue #9. These assets are for review and a potential submission; they do not publish the extension.

## Upload files

| File in `exports/` | Purpose | Size |
| --- | --- | --- |
| `store-icon-128.png` | Store icon (RGBA) | 128 × 128 |
| `promo-440x280.png` | Required small promotional tile (RGB) | 440 × 280 |
| `screenshot-01-save-1280x800.png` | Paper match and collection picker (RGB) | 1280 × 800 |
| `screenshot-02-collect-1280x800.png` | Collection filtering, dark warm palette (RGB) | 1280 × 800 |
| `screenshot-03-settings-1280x800.png` | Actual Settings page (RGB) | 1280 × 800 |

`LISTING.md` contains the suggested name, short description, detailed description, links, and screenshot order. Privacy policy details remain in issue #10.

## Editable sources and reproduction

- `scenes.html`: screenshot compositions, captions, and iframes displaying the actual extension pages.
- `promo.svg`: generated, editable promotional artwork using the approved icon. For persistent copy/layout changes, edit its template in `scripts/export-store-assets.mjs` before regenerating.
- `assets/branding/companion-icon.svg`: the shared source icon.
- `scripts/export-store-assets.mjs`: promo renderer and local screenshot capture.
- `capture-report.json`: capture browser, UI modes/palettes, scale, and validation results.

From the repository root:

```sh
npm ci
npx playwright install chromium
npm run assets:store
```

Alternatively, use an installed Chrome binary:

```sh
STORE_ASSET_BROWSER_CHANNEL=chrome npm run assets:store
```

The exporter always launches a separate temporary browser profile. It serves only repository extension/store files over a loopback server and blocks requests to other origins. It closes the browser and server when finished. It never connects to the user's browser profile, signs in, or saves a paper.

Screenshot typography uses the platform system font. These exports were captured on macOS; other operating systems may render text differently. Dimensions and UI content remain checked during capture.

## Accuracy and privacy

The screenshots embed unchanged `extension/popup.html?preview=1` and `extension/options.html`, not a redrawn product UI. Only the surrounding explanatory composition and uniform screenshot scaling are added. The popup's visible preview banner identifies the example data. Collection selection and filtering use the real UI controls. The sample paper and collections come from the existing built-in preview fixture; no private account information or authenticated network responses are used. No fake save success is shown.

Screenshots show version 0.5.0 and its current “Unofficial personal prototype” footer. Regenerate after any release UI changes, including a version or footer change. The diagnostic timing page is not depicted; excluding its code from the public package is separate work in issue #10.

The store icon has 96 × 96 artwork with 16px transparent padding inside a 128 × 128 canvas, following the square-icon guidance. `extension/manifest.json` uses the same store export for its 128px icon. Popup/Settings header icons and the larger toolbar framing remain unchanged.

## Requirements checked

Checked on 2026-09-30 against [Supplying Images](https://developer.chrome.com/docs/webstore/images) and [Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing): 128px PNG icon, 440 × 280 small promo, and 1280 × 800 screenshots. Promotional and screenshot exports are opaque RGB PNGs with full-bleed rectangular canvases. The optional marquee and video are not included.

Review the final UI and developer-dashboard requirements again before submission. This asset pack does not complete the privacy policy, permission explanations, or release-package cleanup.
