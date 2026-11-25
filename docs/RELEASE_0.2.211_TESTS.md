# v0.2.211 — Map layer persistence and regional camera import

Complete cumulative source release based on v0.2.210. No additional Python dependencies or schema migration. Existing MeshCore snapshot, local observations and national ALPR cache are preserved.

## Changes
- The existing browser-local map preference record now contains local mesh and public mesh toggles. Older records retain their previous values, and mesh defaults remain off if missing. Restored local mesh layers request the existing read-only inventory when Map opens; public layers use the cached snapshot. Only explicit public refresh downloads a new directory.
- Map mesh individual markers are 20 CSS px; clusters use at least 24 CSS px and grow horizontally as needed. Label font remains 10px. Existing camera colors unchanged.
- Explicit visible-area Overpass import now queries ALPR, speed and red-light tagged devices, including enforcement relation node members with the `device` role. Coordinates of ordinary traffic lights, `from`/`to` members and unknown device positions are not inferred. Combined speed/red-light records retain both categories. Imports are community reports, not proof of operation. Local copy is retained for offline use; reimport updates matching source IDs. The nationwide ALPR download is unchanged and still does not cover red-light/speed cameras. Overpass is bounded to 8° × 8° maximum, with smaller areas recommended. Only requested viewport bounds are transmitted, not GPS tracks.
- Cellular observation label is clarified. Public towers, estimated cellular sites, carrier coverage polygons, Meshtastic and Reticulum public directory adapters are not included in this release.

## Verification
- Full Python suite: 622 tests passed (Python 3.13.5), zero failures or skips. The suite began before the final frontend map-open event and cosmetic backend message/User-Agent edits; focused importer/version tests were rerun on final source.
- Focused Python tests for OSM parser, reimport/deduplication, previous area-import HTTP contract and release version passed.
- All 168 JavaScript regression scripts passed. Extended browser-storage test covers all six mesh toggles and old preference records. Isolated Chromium (1280×800, 800×480) with actual markup/CSS/marker script and synthetic cached data checked smaller markers, borderless controls, camera colors and close action.
- Live Overpass requests, full interactive application browser test, physical hardware, Windows updater and GitHub CI not verified. The isolated browser fixture is not a real live map.

## Acceptance
Stop OpenRF. Use `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath "$env:USERPROFILE\Downloads\OpenRF-v0.2.211.zip" -NoPush`, then `cd /mnt/c/projects/OpenRF && python3 -m openrf` from WSL. Select public and local mesh layers, reload the browser, and verify their checked states persist and the cached directory renders. Turn them off and reload again. For cameras, zoom to a city or county, enable red-light and speed camera layers, and choose Map → Layers → Camera locations → Import OSM cameras in view (online). Review per-category counts; zero results are not proof that no cameras exist. Imported records remain local on refresh/restart. Keep orange ALPR, red red-light, yellow speed.
