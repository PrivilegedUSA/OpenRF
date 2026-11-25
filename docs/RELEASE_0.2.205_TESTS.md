# OpenRF v0.2.205 — Map layer and feature-info fixes

Base: complete v0.2.204 bundle. Changes are limited to primary-map frontend code, styles, release identifiers, documentation and regression fixtures. No radio adapter, backend storage or Surveillance Hub implementation changes.

## Acceptance checks

1. Stop OpenRF, install the complete bundle with the PowerShell updater, then start OpenRF in WSL (`cd /mnt/c/projects/OpenRF && python3 -m openrf`). Reload the browser/Electron view.
2. Open Map > Layers. Verify padding under Mesh nodes and equally sized 17px checkboxes for Meshtastic, MeshCore, Reticulum and Repeaters / infrastructure.
3. Enable a mesh layer. Verify the reported position and unlocated counts; when no positions are available the panel explicitly says no pins can be drawn. This layer is based on the local radio inventory, not an online public mesh directory. With no radio or no advertised coordinates an empty layer is expected. A reported position may be outside the viewport or stale. Reticulum destinations remain unlocated.
4. With supported radio hardware already connected, refresh its contact list as appropriate and verify reported positions against the node inventory; enable/disable the layer and check that pins appear/disappear. No automatic radio connections or transmissions are initiated by this feature.
5. Select a community ALPR marker, open Layers and verify its info popup closes. Disable ALPR and verify the marker disappears immediately; repeat for other camera categories. Re-enable and click again. Also check navigation settings, destination search, sidebar navigation, header Wi-Fi/messages/calendar menus, manual observation, SDR site and waypoint details. Route and navigation state should remain intact.
6. Verify that a layer with no reported coordinates does not fabricate a position. If no pins appear despite nonzero reported positions, record the layer status and selected protocol; inspect map viewport and radio inventory.

## Tests in development environment

- JavaScript: 165 regression scripts passed, including focused popup lifecycle and mesh layer status tests. Updated canonical asset version check passed separately.
- Isolated Chromium at 1280x800 and 800x480: actual HTML/CSS and mesh dashboard script, synthetic fixture inventory, four equal checkboxes, status counts, raster and mocked vector marker adapters, layer-off state all passed.
- Full application Chromium navigation was blocked by environment policy. Live radio inventory, physical device, full running map interactions, Windows updater and GitHub CI were not verified.
- Existing cached data may be retained when a dashboard request fails; status identifies that failure. No live position or reachability is inferred.
- Python: all 611 regression tests passed (Python 3.13.5); compilation passed. Existing SQLite resource warnings remain. No physical hardware or other Python versions verified.
