# OpenRF v0.2.215 — Compact camera controls and regional retry

Cumulative update based on the verified v0.2.214 ZIP. No database migration, cache deletion, new data provider, or dependency.

## Changes

- Move Camera locations directly after the OSM regional import and before Public mesh network. Shorter two-column buttons, smaller padding, and collapsed explanatory text; keep the saved count, alternate imports and manual reports accessible.
- Keep the two existing Overpass providers and 45-second socket timeout. If both fail with transient gateway errors (502/503/504) or network timeouts and the viewport spans at least 0.75 degrees in either dimension, retry in four sequential quadrants, without recursive subdivision. Stop if any quadrant fails. Deduplicate by OSM ID and category before saving a complete result in the existing transaction. No split retry for offline errors, invalid responses, rate limits or small areas. This is best-effort, not guaranteed provider access. A retry can take longer than the original query.
- Show section number, completed sections, provider and measured per-request byte progress when available. No fabricated overall download percentage. Error messages no longer repeat the same provider list twice.
- Map camera requests now pass selected categories to the backend, so unchecked ALPR records cannot consume the result cap. The original unfiltered API remains available. Selected categories still share a combined limit.
- Version/cache identifiers updated across the UI, backend, Electron and bundle metadata.

## Validation

- New Python tests simulate a 502 plus timeout followed by four successful quadrants, duplicate boundary records, a partial failure with saved data preserved, no retry on rate limiting or small areas, and selected-category result limits.
- New JavaScript test checks section order, compact layout, collapsed details and retry/selection wiring. Existing browser-job and style-restore tests remain in the full suite.
- Local provider probe failed at DNS resolution in this environment. Neither real provider success nor full rendered application behavior is verified. Windows updater, Raspberry Pi hardware and GitHub CI are unverified.

## Acceptance

1. Install the cumulative ZIP using the existing updater and restart OpenRF. No cache reset or redownload is required.
2. Verify Camera locations is directly below regional import; expand About the nationwide download to inspect original details.
3. Confirm previously saved ALPR and MeshCore counts. Switch basemaps without a browser refresh.
4. Import a city-sized region; check provider status, completion/error, and per-category totals. If a larger area fails with a gateway/timeout on both providers, the UI should show sequential retry sections. If a section fails, existing records stay intact. If the providers remain unreachable, zoom closer and retry later.
5. Disable ALPR while leaving red-light and speed enabled; the saved map query should not be limited by hidden ALPR records.

## Changed files

- Backend: `openrf/camera_catalog.py`, `openrf/server.py`, `openrf/__init__.py`.
- Frontend: `openrf/static/index.html`, `app.css`, `camera-layers.js`, `weather.js` (version header).
- Tests: `tests/test_camera_retry_v215.py`, `tests/test_camera_compact_v215.js`.
- Metadata: root `openrf-bundle.json`, `BUNDLE_FORMAT.md`, `CHANGELOG.md`, `README.md`, this document, Electron `backend.js`, `package.json`, `package-lock.json`.

## Final release validation

- Python 3.13.5: all 630 tests passed (80.043 seconds).
- Node.js 22.16.0: all 171 JavaScript regression suites passed; application JavaScript syntax checks and Python compilation passed.
- Verified original v0.2.214 ZIP CRC and preserved all 728 baseline files. Release builder verifies output CRC, manifest, paths, and ZIP32 compatibility.
