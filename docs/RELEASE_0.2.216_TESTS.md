# OpenRF v0.2.216 — Camera import scope and layer layout

Cumulative release based on v0.2.215, including its smaller-area retry and compact ALPR controls. No migration, cache deletion, dependency changes or new providers.

- The regional import button explicitly requests SPEED and RED_LIGHT, not ALPR, independent of layer visibility. The backend validates category selections, builds only the corresponding Overpass selectors (including on subdivision retries), and rejects out-of-scope records at storage time. Existing API clients that omit categories retain the legacy all-camera import behavior.
- Both regional import and nationwide ALPR actions are inside Camera locations, above Public mesh network. Nationwide download remains independent; it is not a speed/red-light database. Adjacent section borders are replaced by single separators. Existing advanced options, manual camera entry, offline status and progress remain accessible.
- Existing local and national camera records are not removed, including any records from older regional ALPR imports. This does not retroactively reconcile duplicate records across sources. The map result cap remains 1,000 by default; the import safety cap is 20,000. Provider timeouts depend on area and service availability, not a 100-camera limit.
- No live provider or rendered browser validation was performed for this release. WSL installation, Windows updater, physical hardware and GitHub CI remain unverified.

## Acceptance

1. Install v0.2.216 directly; no need to install v0.2.215 first. Restart OpenRF and reload the browser.
2. In Map layers, confirm one Camera locations section above Public mesh network, and one divider between public and local mesh sections.
3. Confirm the existing ALPR and MeshCore counts and saved layer settings. Do not redownload caches just for this update.
4. Import a city-sized area with the regional button. The status should show only speed and red-light results; zero tagged results is not evidence of no cameras. Verify refresh recovery and retained data if the provider fails.
5. Switch basemaps and confirm all enabled layers persist.

## Changed files

- `openrf/camera_catalog.py`, `camera_jobs.py`, `server.py`, `__init__.py`.
- `openrf/static/index.html`, `app.css`, `camera-layers.js`, `weather.js` (version header).
- `tests/test_camera_scope_v216.py`, `test_camera_scope_v216.js`, `test_camera_compact_v215.js`, `test_camera_import_feedback_v212.js`.
- `README.md`, `CHANGELOG.md`, `BUNDLE_FORMAT.md`, this document, `tools/openrf-electron/backend.js`, `package.json`, `package-lock.json`, root manifest.

## Validation results

- Python 3.13.5: 633 tests passed (80.284 seconds); compilation passed.
- Node.js 22.16.0: 172 regression suites passed; changed JavaScript syntax checks passed.
- All 731 original v0.2.215 files retained.
