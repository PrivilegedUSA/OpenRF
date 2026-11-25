# OpenRF 0.2.220 — release checks

Scope: network-specific public mesh clusters and screen-space collision offsets for MeshCore, Meshtastic and Reticulum. Both vector and raster renderers share the same layout function. Offsets do not change node coordinates or saved data. Leader lines identify the original map anchor. Other layers and local mesh marker behavior are unchanged. At extreme densities or in very small viewports available display space may be exhausted; zoom in if necessary.

Changed files: `openrf/static/public-mesh.js`, `openrf/static/app.css`, `tests/test_public_mesh_overlap_v220.js`, release metadata/cache keys/User-Agent strings, README, changelog, bundle format and this release note. No new dependencies or database migrations.

Validation: JavaScript regression suites (177) passed, including coincident positions across networks, adjacent bins, dense data, unchanged anchors, separate marker clicks and mocked raster/vector rendering. Python source compilation passed. Chromium standalone visual check timed out; rendered map testing remains unverified. No live provider or RF hardware tests were attempted for this display-only change.

Acceptance: Enable all three public networks at once, inspect overlapping markers and clusters, pan/zoom, switch all basemaps, click each marker and compare reported coordinates. Confirm cached directory counts and persistent layer preferences remain intact after restart. Local radio markers are not included in the public-directory collision layout.

Final regression: Python 3.13.5 full unittest discovery — 647 tests passed (82.195 seconds). Node.js v22.16.0 — all 177 JavaScript suites passed. All top-level application JS syntax checks passed.
