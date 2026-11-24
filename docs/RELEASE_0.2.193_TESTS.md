# OpenRF v0.2.193 — release notes and verification

## Changed files
- `openrf/static/surveillance.js`: render two always-visible up/down SVG chevrons on each sortable media header; emphasize the current sort direction and preserve aria-sort/keyboard interaction.
- `openrf/static/surveillance.css`: add balanced top padding to expanded playback row and style chevrons without introducing external icons or network dependencies.
- `tests/test_surveillance_frontend_v193.js`: focused assertions for chevrons, accessible sort state, and expansion spacing.
- Release/version files: `openrf-bundle.json`, `openrf/__init__.py`, `openrf/static/index.html`, `openrf/static/weather.js`, `tools/openrf-electron/backend.js`, Electron package metadata, `BUNDLE_FORMAT.md`, `README.md`, `CHANGELOG.md`, and this document.

## Test steps
1. Install the complete ZIP with `Update-OpenRF.ps1 -ZipPath ... -NoPush` and launch OpenRF from WSL.
2. Open Surveillance → Recordings and verify Date/time, Camera, Type, Status and Size all show two chevrons **before any header is clicked**.
3. Click each heading; the active sorting direction should highlight while its opposite remains visible. Click the same heading again to reverse order. Tab to headings and press Enter/Space to confirm keyboard operation.
4. Expand a recording. Confirm a gap separates its selected table row from the player, that controls stay within the table at desktop/7-inch widths, and that collapsing and filtering still work.
5. Confirm videos and private files are not modified by these presentation changes.

## Limits
This is a UI-only patch; no live camera, USB/RTSP/audio hardware, Raspberry Pi, installed app or GitHub Actions tests were performed. Existing recorded media stays in private local storage and is not bundled.
