# v0.2.195 — Mesh Network Dashboard (initial Stage 1)

## Changes and verification
- New read-only `GET /api/mesh/dashboard`, typed inventory and Meshtastic SDK database snapshot. Existing protocol APIs and messaging flows remain unchanged.
- New sidebar workspace, protocol summaries, search/filter/sort, detail panel and protocol messaging shortcuts; existing map has four opt-in mesh layer controls and unlocated inventory shortcut. Vector and raster renderers share the same node data.
- Changed backend: `mesh.py`, `mesh_dashboard.py`, `server.py`. Frontend: `index.html`, `app.js`, `app.css`, `mesh-dashboard.js`. New Python/JS tests, release metadata, README and changelog. Existing surveillance source is unchanged.
- Python compileall passed; 25 mesh Python tests passed (including 3 new dashboard tests); all 157 JavaScript suites passed on the development container. Full Python suite was attempted but timed out before completion; not a pass. No physical radio, browser layout, Pi, installation or GitHub CI verification.

## Semantics and limits
- A radio database entry is not a direct neighbor or verified online device. Last-heard age is distinct from position age. One-hour threshold labels stale radio records; missing timestamps are unknown. Reported positions are unverified, with accuracy unavailable. Null Island (0,0) is excluded as ambiguous. No inferred positions or routes.
- Meshtastic reads only the existing connected SDK's memory; no extra packet requests. MeshCore uses existing cached radio contacts (name/key/type only); Reticulum uses saved local destinations. Neither currently supplies validated geographic positions, so those layers will be empty. Repeater classification currently uses explicit Meshtastic role strings only. No new persistent history or automatic contact retrieval, announcing, connecting, bridging or transmission. Network state describes local interface availability, not RF reachability. Message shortcut opens protocol workspace, not a node-filtered conversation.
- Polling every 15 seconds only while dashboard is visible or an enabled mesh layer is visible on the map. Layers off by default, session-only. No new external services or dependencies.

## Manual acceptance checks
1. Install the complete bundle using the existing updater with `-NoPush`; start `cd /mnt/c/projects/OpenRF && python3 -m openrf` in Ubuntu.
2. Open Mesh Network with radios disconnected; confirm saved contacts are labeled historical/saved and absent values unavailable. Search, sort, select details and use messaging shortcuts.
3. Connect a Meshtastic radio using the existing messaging workspace; return to Mesh Network. Verify real radio records against its node database, reported coordinates and telemetry where present, and stale labels. Enable Meshtastic and infrastructure layers in Map; click a pin to open details. Check vector and raster renderers, map controls and navigation separately.
4. Connect MeshCore using its existing workspace; confirm contacts populate; verify Reticulum saved destinations remain unlocated. Check Surveillance live preview and recording history. Test 1280×800 and smaller windows.
