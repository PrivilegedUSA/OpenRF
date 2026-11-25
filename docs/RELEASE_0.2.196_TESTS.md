# v0.2.196 — MeshCore map inventory

SDK reference: https://github.com/meshcore-dev/meshcore_py (contact coordinates in decimal degrees). The Companion radio protocol documents stored advert timestamps; these are not proof of reception by the local radio. Positions are stored contact metadata, not verified live locations. Zero/zero, missing, nonfinite and out-of-range coordinates are excluded. Repeater role is type 2. No route inference or automatic refresh command is introduced.

Changed files: meshcore_radio.py, mesh_dashboard.py, static/mesh-dashboard.js, static/app.css, static/index.html, __init__.py, README.md, CHANGELOG.md, two new regression tests and this document.

Validation: 5 dashboard Python tests, 8 MeshCore Python tests, 3 JavaScript suites and dashboard JS syntax passed. Existing breadcrumb database ResourceWarnings appeared during the initial regression run. Full regression suite, physical radios, visual layout and CI not verified.

Manual: update using the root updater, start `python3 -m openrf` from the WSL repository. Connect a compatible Companion explicitly, refresh contacts in MeshCore, open Mesh Network and verify reported positions/roles against radio contacts. Enable MeshCore and infrastructure map layers; inspect markers in vector and raster modes. Confirm messaging and surveillance still operate. Unknown positions must remain unlocated. No automatic transmissions should occur from dashboard polling.
