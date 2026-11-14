# OpenRF v0.2.65 — Map layer preferences and Directions UI

## Changed files

- `openrf/static/app.js`: restore/store nine checkbox visibility choices, maintaining map renderer state on load.
- `openrf/static/camera-layers.js`: save camera checkbox changes and do not silently enable camera layers after importing or manually saving records.
- `openrf/static/app.css`: one Directions scroll area, sticky heading, narrower panel and smaller centered borderless map close buttons.
- `openrf/static/index.html`: version and asset cache-busting strings.
- `openrf/__init__.py`, `README.md`, `CHANGELOG.md`, version-specific regression fixtures, new `tests/test_map_layer_prefs_v065.js`.

## Local tests

1. `python3 -m unittest discover -s tests -q` — 237 tests expected.
2. `for f in tests/*.js; do node "$f" || exit; done` — 43 test files expected.
3. Syntax: `python3 -m compileall -q openrf`, `node --check openrf/static/app.js`, `node --check openrf/static/camera-layers.js`, `bash -n` for shell scripts.
4. Isolated Chromium layout smoke at 800×480, 497×800, 390×844, and 480×320 checks one outer Directions scrollbar, sticky summary, free right-hand button column, and compact X controls.
5. Extract the finished ZIP and repeat the Python/JS tests; verify `openrf-bundle.json` and all v0.2.64 paths are retained.

## Manual verification on the user's WSL/browser

- In Map → Layers, disable ALPR, disable Wi-Fi, enable Red-light; reload OpenRF. All three selections should remain, and disabled layers should not render markers. Turn them back on and reload again.
- Import an ALPR snapshot with ALPR display disabled: it should remain disabled until explicitly checked. A new map layer import does not discard any saved camera data.
- With a long Valhalla directions list expanded, scroll the panel: only one scrollbar and a sticky heading should appear. The right-side zoom/recenter/tool controls should remain visible and clickable.
- Check map-Layers/Map-Tools X alignment and tap target.
- Storage blocked/private browsing: preferences may not persist across reload, but the page should still work with defaults.

## Limitations

No physical Pi, live Valhalla route recalculation, GNSS hardware, or full-browser local-server navigation was verified. Browser navigation to localhost was blocked by the Chromium environment. LocalStorage is browser-profile-specific and will be cleared if the browser's site data is cleared. This release adds no internet service or required login, and does not touch offline map, camera or routing databases.
