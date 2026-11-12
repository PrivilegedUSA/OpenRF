# OpenRF v0.2.32 — Release tests, WSL install and limitations

## Installation (complete source ZIP)

1. Download `OpenRF-v0.2.32.zip` into Windows Downloads. Stop the existing OpenRF Python server using Ctrl+C (do **not** stop your separate Valhalla Docker service).
2. Run in **Windows PowerShell** from any directory:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```
3. Run **inside Ubuntu**:
   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```
4. Open `http://127.0.0.1:8765/` in Firefox and use Ctrl+Shift+R.

## Map and marker acceptance checks

- At 458×706 **and 800×480**, the Survey Map shows a floating search row and **Get directions** / disabled **Start navigation** inside the map, rather than the map starting below a long form. Test normal zoom, recenter, Layers, Add Observation and attribution.
- Country names should appear on a **zoomed-out online OpenRF Dark/Light basemap**, provided country features and fonts are available from the online source. Do not expect nationwide features in the Amador/Calaveras *offline regional vectors* mode. Do not remove required attribution.
- Choose a destination by tapping the map. The marker is a **solid red circle**. Pan or zoom anywhere outside the circle; drag the circle to adjust its location and check the coordinate input updates.
- Enable online address search only if you consent. With MapTiler key configured, choose an address match. Press **Get directions**. Verify that a real **Valhalla road route** is shown. Now drag its **red endpoint** and press Get directions again; prior route should be invalidated until recomputed.

## GPS-follow beta and planned maneuver checks

- Keep local Valhalla running (check `bash tools/setup-valhalla-wsl.sh --status`). Confirm a Northern California road plan has a nonempty turn list.
- **Start navigation** is not available for direct lines or failed routes. When a confirmed ROAD_ROUTE exists, clicking it requests browser location permissions and shows a follow panel and a close-zoom view. When the device provides valid moving heading and speed, MapLibre rotates and pitches; otherwise it stays north-up. In Firefox desktop/WSL the browser position may be inaccurate or mocked, so this does *not* validate driving behavior.
- Bad/stale fixes, location denial, and position far from the planned route must produce visible caution text rather than pretend the current turn is known. Test Stop; the browser position watcher must end. Changing to another OpenRF page also ends watching. Navigation alone does not record waypoints or observations. All planning and follow positions remain local; only opted-in geocoding sends **typed address text**, never GPS.
- No speech, turn sound, background guidance guarantee, automatic rerouting, live traffic or lane guidance. This code is **not ready for use as a primary driving navigation system**. Use a known dependable navigation device and don't interact with the app while driving.

## Alabama and other cross-country destinations

- The preexisting `tools/setup-valhalla-wsl.sh` downloads only Geofabrik **Northern California** roads. OpenRF Dark/Light regional MBTiles only controls map *appearance*, not route graphs. If Valhalla cannot find a route from NorCal to Alabama, it must show an explicit **coverage/error** and not a straight-line road. Do not interpret a connected tile service as national routing capability.
- Nationwide routing requires expanded U.S. OSM input, graph rebuild, memory/disk benchmarking, and regional extract/merge verification. **This release does not download national road data or claim nationwide coverage.**

## Automated verification

On the extracted `project/` root:
```bash
python3 -m unittest discover -s tests -q
node --check openrf/static/app.js
for f in tests/*.js; do node "$f" || exit 1; done
bash -n tools/setup-valhalla-wsl.sh
```

## Source changes

- `openrf/static/index.html`, `app.css`, `app.js` — map overlay, GET/START flow, draggable endpoint, GPS-follow beta
- `openrf/routing.py` — global Valhalla maneuver geometry indexes over multi-leg routes
- `openrf/vector_maps.py` — runtime country labels only (original style resources unchanged)
- `tests/test_v032_navigation.py`, `tests/test_map_navigation_v032.js` — new coverage
- Existing frontend regression tests updated to recognize the new explicit opt-in GPS follow and map overlay
- `openrf/__init__.py`, `openrf-bundle.json`, `README.md`, `CHANGELOG.md`, this document and the existing server version test — version/documentation

Unchanged: the embedded Amador/Calaveras MBTiles, approved styles, bundled fonts, external Valhalla data, updater script and all private application data. **Browser/physical Raspberry Pi GNSS and real-world driving tests were not performed in this build environment.**
