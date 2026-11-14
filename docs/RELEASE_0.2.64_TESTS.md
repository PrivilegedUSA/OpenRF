# OpenRF v0.2.64 — Release and test notes

## Changes
- Route comparison popup is anchored below the *measured* collapsed Directions heading, including a 12px gap when heading text wraps at small widths.
- Route choice maximum height adjusts to available map space; existing overlay dismissal and selection remain the same.
- No changes to Valhalla requests, road exclusions, map tiles, radio drivers, or privacy-sensitive state.

## Checks
- `python3 -m unittest discover -s tests -q`
- `for f in tests/*.js; do node "$f" || exit 1; done`
- `python3 -m compileall -q openrf` and `node --check openrf/static/app.js`
- Isolated Chromium layout test at 800×480, narrow phone, and compact landscape, with an intentionally two-line Directions heading.
- Archive manifest/version/file preservation against v0.2.63.

## Field test
1. Save OpenRF-v0.2.64.zip to Downloads, stop the server, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`.
2. In Ubuntu WSL run `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
3. Calculate a route with enough turns/cameras to wrap the summary. Confirm Choose a Route is fully **below** Directions. Compare teal/amber routes; expand Directions, which should hide the popup.

## Limitations
No test against the user's actual live local Valhalla graph or moving GPS hardware. No change to camera data, route avoidance, or the selected route.
