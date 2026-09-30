# Companion icon

The editable source is companion-icon.svg. It preserves the paper, bookmark, and inbox motif from the initial AI-generated concept, redrawn as flat geometric paths.

Colors: blue #365CC7, ivory #FFF9EE, orange #E77B3C. The blue tile stays the same across application themes and palettes. Space outside the rounded tile is transparent.

PNG exports live in extension/icons at 16, 24, 32, 48, and 128 pixels. The 24px export serves toolbar displays at 1.5× scale. Chrome's manifest and action icon declarations use PNGs; retain the SVG as an editable source.

To regenerate all packaged PNGs from the repository root:

```sh
npm ci
npm run icons:build
```

The development-only exporter uses the pinned sharp dependency, rendering at 288 DPI and resizing to each target dimension while preserving transparency. The extension uses the committed PNGs and needs no build step. Inspect exports at actual pixel sizes on light and dark backgrounds after changing the geometry.

The popup and Settings headers share the 128px export. No fonts, remote resources, or generated textures are embedded.

## Toolbar framing

The action uses separate toolbar-16.png, toolbar-24.png, toolbar-32.png, and toolbar-48.png exports. Generate these from the same SVG with viewBox="4 4 120 120" instead of viewBox="0 0 128 128". This removes only the transparent outer padding, making the artwork 6.7% larger without changing its proportions. The rounded corners retain transparency. General extension icons and page headers continue to use the original padded exports.

## Store icon

`store-128.png` uses `viewBox="-16 -16 160 160"` to place the 96px square artwork inside a 128px canvas with 16px padding. The manifest’s 128px icon uses this export for installation/store presentation. Header artwork and toolbar exports retain their existing framing. `npm run icons:build` regenerates it alongside the other sizes.
