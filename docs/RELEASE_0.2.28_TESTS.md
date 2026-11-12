# OpenRF v0.2.28 — U.S. Census address fallback

## What changed

- `openrf/geocoding.py`: U.S. Census single-line fallback **on completed street-address submission only**, explicit permission, strict size/type validation, no background location uploads. Photon demo autocomplete remains optional.
- `openrf/server.py`: explicit `mode=final` request parameter and status field.
- `openrf/static/app.js`, `index.html`, `app.css`: fallback-on-submit, more considerate debounce, direct map destination picker, explanatory status text.
- `tests/test_routing_geocoding.py`, `tests/test_navigation_frontend.js`, `CHANGELOG.md`, `README.md`, `openrf/__init__.py` and release version assertions.

## Installation

In Windows PowerShell (after saving ZIP in Downloads):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

Restart OpenRF in Ubuntu after Ctrl+C:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

Refresh Firefox at `http://127.0.0.1:8765/` using Ctrl+F5.

## Tests

```bash
python3 -m unittest discover -s tests
node --check openrf/static/app.js
node tests/test_navigation_frontend.js
bash -n tools/setup-valhalla-wsl.sh
```

## Browser QA

1. Without checking the opt-in, typing a street address should not trigger remote requests; saved places, coordinate pairs, and Choose on map remain available.
2. Clicking Choose on map should set the destination on the next map click; then Start navigation should try local Valhalla (not Photon).
3. If Valhalla is reachable and both coordinates lie in its graph, verify **ROAD ROUTE** follows roads, includes mileage and planned turns.
4. Opt in. Photon suggestions may appear after about 1.45 s; failure must be explained, not hidden.
5. Type a **complete** street address such as `1600 Pennsylvania Ave NW, Washington, DC` (outside Northern California Valhalla coverage) and click Start navigation. Census should return candidates if network access is available; select one and re-submit. A Northern California address with house number, city and state is needed for actual Valhalla route testing.
6. Confirm not even selected destinations are treated as observed surveillance infrastructure. No logs/tracks are recorded.

## Known limitations

U.S. Census TIGER geocoding uses interpolated street ranges; rural/private roads and PO boxes may have no match. Its service can also fail. The public Photon demo is not guaranteed and sometimes times out. Neither is offline. Automatic address suggestions are **not guaranteed**. Local Valhalla installation and road dataset are required for actual road route calculations. This release does not provide active GPS-following or turn-by-turn guidance. No live geocoder, browser, routing hardware or Raspberry Pi field tests were performed.
