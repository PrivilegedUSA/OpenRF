# OpenRF v0.2.144 — Offline topographic areas, route elevation and map header

## Delivery

The complete `OpenRF-v0.2.144.zip` must contain ZIP-root `openrf-bundle.json` exactly equal to `{"project":"OpenRF","formatVersion":1,"version":"0.2.144"}` and all installable source beneath `project/`. No updater scripts, `.git`, credentials, raw captures, `.openrf-state`, or personal SQLite/location files may enter the package. All previous managed features and map asset files must remain included.

## User-visible changes

1. On a 1280×800 landscape layout, the permanently displayed left sidebar removes the redundant hamburger at top-right. Narrow drawer mode still displays the menu control.
2. The clock and ALTITUDE cards have matching **44px** height. ALTITUDE shows only a title and feet. Browser altitude with no finite/reasonable vertical accuracy is not accepted, so fake 0 ft becomes **— ft**; source/uncertainty remain available in the tooltip on valid readings. Physical 3D gpsd receiver readings are distinct from browser fallbacks. No terrain height is substituted for missing GPS height.
3. Under Map → Layers → **Offline maps** → **Offline map files**, save/select a bounded geographic plan of ≤96 tiles, give it a new filename and explicitly approve the USGS contact. **Download topo region** starts a background operation with progress and Cancel. Only successful validated images become private raster MBTiles, never a half-downloaded package. Select the installed map in the Offline basemap selector; offline raster viewing works without a network. The regular Topographic radio is still the online style; raster tile packages cannot yield numeric terrain heights. Source attribution is retained.
4. After planning a driving or walking route, expand **Route elevation profile** in its directions. **View saved profile** accesses only the private local cache; **Prepare online** asks permission before sending up to 13 sampled route coordinates to USGS 3DEP EPQS. The SVG profile shows modeled terrain elevations in feet along the route, with missing samples represented as gaps. Profiles are private and reusable offline when that exact route is sampled again. This is not a generalized offline elevation model, 3D GPS, certified surveying data, or a trail-safety guarantee.

## Automated verification

Run from `project/`:

```bash
PYTHONPATH=tests:. python3 -m unittest discover -s tests -p 'test_*.py' -q
for script in tests/*.js; do node "$script" || exit 1; done
node --check openrf/static/app.js
```

Focused cases include `tests/test_topographic_v144.py` (tile bounds, mixed image MIME, atomic/cancel/no-overwrite and user permission), `tests/test_route_elevation_v144.py` (offline cache miss/no remote call, bounded 3DEP samples, private hash-only cache, partial heights, reject nonsense), `tests/test_terrain_api_v144.py` (loopback endpoint/asset and explicit-network gates) and `tests/test_topo_route_ui_v144.js` (controls, 44px badge, breakpoint CSS, equal-distance route samples), plus the updated legacy integration tests. All external tile/elevation calls in these tests are **stubbed**, not live-network tests.

Result in the development container: **398 Python tests passed; 110 JavaScript test scripts passed**. Source syntax validation passed. Chromium visual smoke test could not start because this container blocks its singleton socket (`Operation not permitted`), so the 1280×800 appearance must be confirmed on the intended device.

## Windows/WSL installation and field checks

1. Put `OpenRF-v0.2.144.zip` in Windows Downloads. From any PowerShell working directory run:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`
2. Restart OpenRF in WSL (`cd /mnt/c/projects/OpenRF && python3 -m openrf`) and hard-refresh Firefox (`Ctrl+Shift+R`). The updater handles managed files; it does **not** copy or replace private offline map data.
3. At **1280×800**, check the left sidebar is present and top-right hamburger is absent; resize below the drawer breakpoint and confirm it reappears. Check clock/ALTITUDE height alignment with both — ft and a genuine GPS height.
4. Keep the internet connected, open Map → Layers → Offline maps → Offline map files. Choose a very small saved area with ≤96 candidate tiles and zooms suitable for the target scale, confirm USGS download, observe progress and completion. Select the resulting local raster package, then **disconnect internet** and verify tiles in the included area. Expect partial/missing coverage if the provider lacks some requested tiles. Cancel a test download and verify no named `.mbtiles` package was installed.
5. With Valhalla running locally, create a walking/driving route and open **Route elevation profile**. Check that **View saved profile** alone never contacts USGS. Prepare online after the explicit confirmation, observe the model-height chart, then disconnect internet and view the saved profile again. Changing the route geometry may require another preparation.
6. Verify map credits, Emergency tabs, walking/driving GPS-follow and backtracking remain accessible. The desktop browser is not expected to supply trustworthy altitude just because latitude/longitude works.

## Test limits

- The release's automated tests do **not** prove live USGS service reliability, tile permission changes, actual 3DEP data quality/coverage, vertical GNSS accuracy, physical SDR/receiver behavior, true seven-inch touch rendering, Docker Valhalla route availability, or CI/GitHub success.
- Downloading topographic **raster map tiles** is not downloading terrain DEM values: arbitrary new route elevation profiles still require approved online sampling. Cached profiles apply to the sampled route only. A truly offline numeric DEM importer can be added in a subsequent patch.
- USGS 3DEP elevations are interpolated ground heights and may differ from GPS ellipsoid height or true local surveyed elevations. Field users should not rely on the profile to judge walking or driving safety, trail availability, grade or accessibility.
