# v0.2.212 — Compact map markers and camera import feedback

Complete cumulative source release from v0.2.211. No schema changes, cache deletions or new dependencies.

## Changes
- Individual public/local mesh pins: 16 CSS px; cluster minimum: 20 CSS px. Labels remain 10px and larger counts can expand horizontally. Existing palette and layer persistence are unchanged.
- Restore the Cellular layer label; it still represents local observations, not tower or coverage data.
- Move regional OSM camera import and its status immediately after the map layer checkbox grid and before Public mesh network. Keep import progress/result independent of normal map refresh status. Disable duplicate requests while an import runs and report per-category counts, zero results, hidden layers and failures explicitly.
- Overpass network read timeout increased to 45 seconds per endpoint; provide bounded, provider-specific error categories. Resolve enforcement-device references using separately returned node coordinates where available. Do not use ordinary traffic signals, relation centers or from/to positions as camera locations.
- Nationwide ALPR cache, camera layer selection and both map renderers are retained. A missing ALPR display has not been reproduced on the user's installation. Check the saved count in Camera locations, then Reload saved area before downloading again. The default database is ~/.local/share/openrf/openrf.sqlite3; an alternate --db changes which saved records are visible. Mesh directory rendering latency on actual maps is not measured or fixed by this release.

## Verification
- Full Python regression suite: 624 tests, OK, Python 3.13.5.
- All 169 JavaScript regression scripts passed, including new import feedback and UI placement coverage.
- Isolated Chromium at 1280×800 and 800×480 passed compact marker, palette, panel/close styling checks using synthetic directory data. This is not a live basemap test.
- Live Overpass imports, full application map interactions, Raspberry Pi hardware, Windows updater and GitHub CI remain unverified. Zero camera records returned does not establish absence of cameras.

## Acceptance
Stop OpenRF. Run the usual PowerShell updater using OpenRF-v0.2.212.zip and launch from WSL with `cd /mnt/c/projects/OpenRF && python3 -m openrf`. Enable ALPR, speed and red-light layers. Zoom into a city or county, select Import OSM cameras in view (online), and check the persistent result below the button. Under Camera locations, verify the nationwide ALPR count and select Reload saved area if needed. Switch basemaps and check that enabled, saved cameras appear. Verify mesh toggle persistence and compact marker appearance. No public mesh download is required if a valid cache already exists.
