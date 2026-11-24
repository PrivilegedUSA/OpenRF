# OpenRF v0.2.194 — release notes and verification

## Changes
- `openrf/static/index.html`: group Camera history and Date range filters in one responsive row; update current source version and asset cache keys.
- `openrf/static/surveillance.css`: larger column headings, compact filled triangle sort indicators; paired filters in regular width, stacked below 680px of available viewport.
- `openrf/static/surveillance.js`: use paired `polygon` indicators instead of outline `polyline` indicators, retaining sort click behavior and ARIA labels.
- `tests/test_surveillance_frontend_v193.js`, `tests/test_surveillance_frontend_v194.js`: preserve legacy regression intent and assert updated markup/CSS and accessible sorting.
- Current version metadata, README, changelog and release manifest.

## Manual checks
1. Install the complete ZIP using the existing PowerShell updater with `-NoPush` and launch WSL OpenRF.
2. On Surveillance → Recordings at a desktop/7-inch width, check Camera history and Date range appear on one horizontal line and that both dropdowns fit the card.
3. At narrow widths, check they stack rather than overflow the page.
4. Confirm the five sortable column headers remain legible, with two solid triangles showing even when unsorted. Click a header twice and verify reverse order and teal active indication; keyboard Enter/Space and `aria-sort` still operate.
5. Expand, play, download and collapse an existing recording to ensure history functionality remains unchanged.

## Local verification results (2026-11-24)
- Python syntax compiled successfully (`python3 -m compileall -q openrf`).
- **587 Python tests passed** across seven non-overlapping groups; all group exit codes zero.
- **156 JavaScript test files passed**, including the updated v0.2.193 compatibility check and new v0.2.194 frontend assertions.
- Chromium browser test passed at 1300, 940, 800, and 600 pixel viewports with **synthetic DEMO camera records**: 2 filters on one line where supported, stacked on narrow viewport, 10 filled triangles visible, and sorting direction reversible.
- Release ZIP integrity, manifest and private-path boundary validation completed after packaging.

## Limits
No camera, microphone, Raspberry Pi, Windows installation, or GitHub CI verification was performed for this layout-only update. Existing recordings and local data are not included in the bundle.
