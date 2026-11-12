# OpenRF v0.2.31 — Map integration, map-pin adjustment, and address assistance

## Install and launch on Windows / Ubuntu

1. Stop the existing OpenRF Python server with Ctrl+C. **Leave Docker/Valhalla running**.
2. Download the complete `OpenRF-v0.2.31.zip` to Downloads. In **Windows PowerShell** (not inside Ubuntu), run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

   The reserved updater is outside managed `project/`. It validates/backs up/installs managed source and normally commits/pushes, unless its supported switches are used. OpenRF does not claim you ran it or that the GitHub CI succeeded.
3. In **Ubuntu**, run:

   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```

4. Firefox: visit `http://127.0.0.1:8765/`, Ctrl+Shift+R for a fresh reload. In Firefox Responsive Design Mode (approximately 430×850), check the 5-inch-sized layout.

## What was integrated

Approved `openrf-dark.json` and `openrf-light.json` from OpenRF Maps v0.1.11 are supplied unchanged under `openrf/resources/`. The main app removes the prototype's **empty custom overlay sources/layers only in-memory when serving styles**; its own live observations, markers, Survey, Layers, Add Observation and navigation remain authoritative. MapLibre v4.7.1 JS/CSS and local Noto Sans glyphs are provided in the release; optional operator-installed v5.24.0 map assets are still preferred where present. The standalone app on port 8766 is **not required**.

Regional Amador/Calaveras data: `openrf/resources/amador-calaveras.mbtiles` (5,703 OSM-derived vector tiles, metadata bounds `[-121.25,37.95,-119.70,38.95]`, native zooms 0–14). The distributed regional map is open geographic data; private GPS, investigations, historical sensor logs and credentials are **not included**. The user's source `.osm.pbf` for Valhalla is not copied or downloaded again.

Select **Map settings → OpenRF Light** to view the light theme; the button toggles between approved styles. Choose **Use offline regional vectors** to switch the live MapLibre source to local MBTiles; choose **Use online vectors** to return. Outside regional bounds, expect no offline roads. The old raster package/coordinate fallback is a separate feature and remains available.

To optionally replace the shipped region with a newer, validated compatible vector archive, copy it outside the project to `~/.local/share/openrf/maps-vector/amador-calaveras.mbtiles`. Keep the MBTiles name and ensure `metadata.format=pbf` or `mvt`, supported `tiles` table, OpenMapTiles-compatible layers and data attribution. The operator-supplied file takes precedence without modifying the shipped original. Don't use this method for raster MBTiles; use existing raster import tools.

## Confirm offline vector serving without internet

From Ubuntu while OpenRF is running:

```bash
curl -s http://127.0.0.1:8765/api/vector/status
curl -s 'http://127.0.0.1:8765/api/vector/styles/dark.json?offline=1' | python3 -m json.tool | head -35
curl -s 'http://127.0.0.1:8765/api/vector/streets?q=25005%20State' | python3 -m json.tool | head -35
```

For full manual offline verification, select offline regional vectors, center on Pioneer/Jackson, **temporarily disconnect internet only after the local app and all resources have loaded**, then pan/zoom locally. Check street and place labels, the blue GPS observer marker (if browser location is permitted), saved survey pins, observation colors, the draggable destination pin and road-route overlay. Local offline *basemap* tiles don't imply local geocoding or road routing unless optional services/datasets are separately running. Attribution remains at lower-left map credit control.

## Route and address checks

- Choose destination on map → tap once (cursor crosshair) → normal map panning is restored → drag the **teal pin** to refine → press **Start navigation**. The plan must use the adjusted position, not the original tap or browser location. Dragging does not save a waypoint or observation.
- Type `25005 St` (house number + 2 letters) to check **offline regional road-name hints**. They complete just a candidate road name; the number has not been verified and no coordinate is assigned. Finish city/state or choose a map point. For *verified early full-address suggestions*, configure a functioning MapTiler or local Photon provider; public Photon may remain unavailable.
- Select an explicitly matched address / pin point, press Start navigation, and verify Valhalla produces a **road-following plan** when its local service is available. This is not live driving navigation, and the map position alone is not a road-destination proof.
- Optional Valhalla status remains: `bash tools/setup-valhalla-wsl.sh --status`. **Do not rerun --install** simply to test this patch.

## Automated checks and limits

On Linux / Ubuntu:

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for t in tests/*.js; do node "$t" || exit 1; done
bash -n tools/setup-valhalla-wsl.sh
```

Automated tests cover style/source separation, real vector tile reads, gzip headers, fonts, HTTP host validation, local partial street-name hints, drag math, existing GPS/map picker and observations. **Chromium is blocked from opening loopback servers in this development environment.** Actual MapLibre rendering, labels and font display, browser geolocation, touchscreen 5-inch interaction, offline network-disconnect switching, Raspberry Pi and RF hardware should be verified on the user's machine; none of those are claimed as field-tested. There is no new SQLite migration.

## Changes overview

`openrf/vector_maps.py` (new); `openrf/resources/openrf-{dark,light}.json` (byte-preserved from prototype); `openrf/resources/amador-calaveras.mbtiles`, `openrf/resources/fonts/Noto Sans Regular/*`, `openrf/resources/street_names.json` (offline geographic resources); `openrf/static/vendor/maplibre-gl.{js,css}` (local browser runtime); `openrf/server.py` (read-only vector HTTP); `openrf/static/app.js`, `app.css`, `index.html` (map/style picker, destination drag and early road-name hints); `tests/test_vector_maps.py`, `tests/test_integrated_vector_frontend.js`, CI, README, CHANGELOG and release docs.
