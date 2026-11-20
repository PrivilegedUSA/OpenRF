# OpenRF v0.2.143 — Map styles and GPS altitude

## New controls

1. Map → bottom-right **Layers** (stacked-sheet icon) → **Base map**: Default / Satellite / Topographic. Selecting a new style does not change the map center or saved RF data.
2. **Satellite** uses the USGS The National Map Imagery Only cached tile service. **Topographic** uses the USGS Topo cached tile service (contours/shaded relief). Both are U.S.-focused, online-only, and selected manually. The map credits icon identifies the provider. The tile requests reveal the viewed map region to USGS. No direct GPS fixes, investigation data or raw radio observations are uploaded.
3. **Default** retains the existing light/dark style and the selected online/regional-offline preference. Installed offline map/raster behavior is preserved; no download or offline cache for the new USGS styles is claimed.
4. The map header shows **ALTITUDE** from fresh GPS-reported altitude in feet. The status shows **MSL** when a local gpsd 3D reading explicitly supplies mean-sea-level height; browser ellipsoid readings show **GPS altitude**. Vertical error appears only when supplied. Missing, invalid or older-than-45-second altitude clears to **— ft**. No elevation is guessed from a map location or contour line; GNSS height can differ from ground elevation.

## License and sources

- Satellite: [USGS Imagery Only service](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer), imagery from USGS The National Map / USDA NAIP and imagery partners.
- Topographic: [USGS Topo service](https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer), including USGS 3DEP/other government datasets and OpenStreetMap-derived data where credited.
- Existing OpenRF regional vectors: © OpenStreetMap contributors (ODbL), Geofabrik, OpenMapTiles-style schema. Source datasets and attribution have not been removed.
- No USGS imagery is bundled, mirrored, bulk-downloaded or added to the local offline tile package. Future offline terrain/elevation datasets will require separate reproducible region packages and license review.

## Automated tests

- `PYTHONPATH=tests:. python3 -m unittest discover -s tests -p 'test_*.py' -q`
- `for test in tests/*.js; do node "$test" || exit 1; done`
- `node tests/test_map_basemap_altitude_v143.js`: simulated style selection, preserve offline vectors on return to Default, display only genuine altitude and expire stale readings.
- `python3 -m unittest tests.test_vector_maps tests.test_local_gnss`: endpoint/CSP allowlist, trusted USGS tile URLs, explicit online-only rejection and gpsd MSL/ellipsoid/2D safety.
- Results: **389 Python tests and 109 JavaScript test scripts passed** in this development environment.

## Test on Windows/WSL and the seven-inch layout

1. Save complete `OpenRF-v0.2.143.zip` in Downloads. In PowerShell run:

   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`

2. Restart OpenRF from WSL (`cd /mnt/c/projects/OpenRF && python3 -m openrf`). Hard-refresh Firefox once with Ctrl+Shift+R.
3. At your 1280×800 layout, open the Layers sheet. Try Satellite and Topographic while online. Look for aerial imagery versus contour/relief tiles; return to Default and confirm your normal OpenRF map is unchanged.
4. Disconnect the network and verify Default still renders **within installed regional coverage**, where your own offline map files are ready. Do not expect satellite or topographic tiles while offline.
5. Grant browser location only if desired. At a real 3D GPS location, confirm feet and any reported vertical uncertainty appear. WSL desktop geolocation often does not report altitude: **— ft** is correct. Leave the map untouched for at least 45 seconds and verify stale altitude expires.
6. Confirm that existing map pins, navigation overlays, camera layers, Emergency tabs and private GPS tracks remain usable.

## Limits

- External USGS live tile loads, real browser WebGL/Firefox appearance on the target screen, physical GPS/SDR, GPS altitude accuracy and locally routed Valhalla road/path choices require operator verification. No service availability or actual field altitude was asserted.
- An attempted headless Chromium screenshot in the development execution environment was blocked by OS socket restrictions; automated API and JS tests do not replace touchscreen visual QA.
