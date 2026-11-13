# OpenRF v0.2.49 — compact five-inch map / radio feasibility proposal

## Implemented

- The map's destination search overlay now has a **Hide / Find destination** toggle. It minimizes to a one-tap button, freeing visible map area while retaining form values and saved route data. The toggle is visual-only; it never starts a geolocation lookup, Wi-Fi/BLE/SDR capture, or navigation.
- The header has a map-only **Focus map / Exit focus** toggle. In focus mode the map takes the viewport and secondary below-map sections are temporarily hidden (not deleted). MapLibre and raster fallback are resized after switching. Leaving the map page exits focus mode automatically. Default: OFF. No persistent tracking or geolocation permission changes.
- Both controls have keyboard-focusable buttons and relevant `aria-expanded`, `aria-pressed` and `aria-label` states. The compact 800×480 layout retains the menu button, offline map display, normal map credits and bottom-right map layers/add controls.
- Added `docs/AMATEUR_RADIO_ROADMAP.md` to define a receive-only SDR audio → read-only transceiver CAT → *much later* restricted transmit progression. **No radio audio playback, transceiver integration or TX is implemented in this release.**
- No backend API or SQLite schema modifications. Offline map MBTiles, stored investigations, past captures, old Android archive and source structure retained.

## Run tests in WSL

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file"; done
node --check openrf/static/app.js
bash -n run-openrf.sh
```

Manually test on Firefox/Chromium at **800×480**, 390×844, and desktop:
1. Open Map, click **Hide**, verify the search form disappears but the Find destination button stays available; expand, verify typed text is retained and the destination input receives focus.
2. Click **Focus map**, verify the map canvas fills the available viewport and the menu and Exit focus remain accessible. **Exit focus** should restore offline-map manager and lower tools.
3. Switch to Spectrum with the hamburger while focused and return to Map; focus is off automatically. Recorded data must not change.
4. Verify map credits and both vector/raster map modes; no browser-location permission request should occur merely by toggling the controls.

## Limitations

- Source/Chromium tests in the build environment are not real Raspberry Pi touchscreen, audio or USB/GPS hardware tests. The radio ideas are a future roadmap, not built functionality. Real RTL-SDR tuning, ham transceiver CAT/PTT, Raspberry Pi power/cooling and WSL passthrough must be separately validated.

### Build-environment verification

- Python test suite: 187 passing tests, including live local-HTTP assertions for the new controls.
- JavaScript source-contract suite: 28 test files, including `test_touchscreen_v049.js`.
- Isolated Chromium DOM/CSS/browser interaction: 800×480, 390×844, 1450×900, with search hide/reopen, text retention, focus mode, page switch and attribution. This did **not** load actual tiles, validate real hardware, or exercise the full HTTP-served page in Chromium (the local test environment blocks browser access to the loopback test server).
