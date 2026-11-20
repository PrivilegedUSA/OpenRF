# OpenRF v0.2.149 — Trip-specific offline map downloads

## Release contents

The complete `OpenRF-v0.2.149.zip` has the root manifest:

```json
{"project":"OpenRF","formatVersion":1,"version":"0.2.149"}
```

All managed app source is below `project/`; the updater, private SQLite data, installed MBTiles, GNSS histories, credentials, signing keys and Git state remain outside the archive.

**Map → planned driving/walking directions → Download map for this trip** is the new workflow:

1. Choose **USGS Topographic** (with contours/shaded relief) or **USGS Satellite**, a **½-, 1- or 2-mile** route buffer on each side, and Compact (9–11), Standard (9–12) or Detailed (9–13) zoom.
2. Click **Estimate trip map**. This sends up to 257 sampled points from the *already planned route* to the **local OpenRF API only**. It estimates actual candidate XYZ tile keys following buffered route segments, deduplicates them, and reports an **illustrative** 40–300 KiB/tile range. It never requests current GPS, contacts USGS or downloads anything. Changing route/options invalidates the preview. Full tile squares can extend farther than the requested corridor.
3. Enter a unique private package name, check explicit network approval and click **Download trip map**. A second confirmation warns that USGS receives the selected tile *areas*; no RF data or complete track history is sent. A preview token guards against changed route options. No arbitrary host or URL is accepted.
4. The background job downloads from the fixed USGS The National Map service, never follows a redirect, limits each tile to 8 MiB, the complete archive to **384 tiles / 128 MiB / 300 seconds**, and checks tile formats. **No partial package is installed** if a requested tile is unavailable, storage is insufficient, the operator cancels, or time/size limits are exceeded. Successful MBTiles packages carry source attribution in the existing private **Layers → Offline maps** selector. Existing maps are never overwritten.

The Default map's remote OpenFreeMap rasterization is **not** silently cached. This release downloads only the two USGS-hosted map imagery types. OpenRF's installed regional vector package and operator-imported raster archives continue to work separately. Any numeric HGT heights, Valhalla routing graph coverage, GPS location accuracy and road/trail access require independent preparation or checks.

## Acceptance checklist at 1280×800

1. Update and restart OpenRF; verify the always-open desktop sidebar, top header, bottom-right map controls and Map → Layers remain in place.
2. Plan local **walking** directions, expand the directions sheet, then expand **Download map for this trip** below the existing elevation and offline tile coverage sections. Repeat with a **driving** route.
3. Try different map sources, buffers and detail presets. **Estimate trip map** should show a finite tile count and approximate size. A longer/higher-detail route may exceed the 384-tile cap; choose less detail or split into legs. There should be **no USGS requests merely from preview**.
4. Check that the download button does not send a request until a unique name is entered, the network approval is checked, and a second confirm prompt is accepted. To avoid an unintended test download, **Cancel** the confirmation prompt on your first check.
5. With an internet connection and sufficient disk space, try a short real route and a new map name. Watch progress. The finished map should be listed under **Layers → Offline maps**; disable internet, select the local package, and inspect actual coverage. Test a cancelled job and verify there is no half-installed package.
6. Confirm **Satellite** and **Topographic** still persist as the browser's selected online basemap (v0.2.148 behavior). A downloaded trip map is an additional locally installed raster; selecting it is separate from that online choice.
7. In an actual field test, verify road/trail graph availability and GPS independently. Downloading imagery does not create offline turn-by-turn directions or certify route safety.

## Automated checks

From `project/`:

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -p 'test_*.py' -q
for test_file in tests/*.js; do node "$test_file" || exit 1; done
node --check openrf/static/app.js
node --check openrf/static/trip-map.js
```

**Result:** 419 Python tests and 116 JavaScript scripts passed, including six new Python tests and one new JavaScript test. The new tests cover bounded route geometry, tile/corridor uniqueness, source and URL enforcement, local read-only preview, loopback-only endpoints, explicit consent, deterministic preview IDs, atomic successful MBTiles builds, missing-tile/cancellation cleanup, JS preview/confirm/progress, and route-change invalidation.

**Not verified in this environment:** Real USGS network downloads, actual file size variation, Pi SD-card write speeds/capacity, live Valhalla road graphs, GNSS movement, battery hardware, physical receiver modules and 7-inch touchscreen appearance. A local Chromium smoke check was attempted but blocked by the sandbox's process/socket restrictions; no visual screenshot validation is claimed. No new required runtime dependencies or SQLite migration.

## Install

Put `OpenRF-v0.2.149.zip` in Windows Downloads (without extracting it), then run the existing updater from any PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The updater validates, backs up, installs managed source paths, and normally attempts a GitHub push; `-NoPush` is available. A push starts CI; it does not prove that CI succeeded. Restart the Linux app and refresh your browser after installation. Nothing here claims your Windows installation ran.

## Next patch candidates

- **v0.2.150:** A simple **Saved trips and map packs** organizer with coverage metadata and safe pruning, plus clearer trip routing-graph readiness checks when Valhalla datasets are available.
- Continue hardware readiness on a real 7-inch Pi device: display, GPS source/fix accuracy, regulated power/battery telemetry, thermal limits, offline file space and receive-only RF peripheral inventory.
