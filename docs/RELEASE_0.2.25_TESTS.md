# OpenRF v0.2.25 — Map-first road routing adapter and address search

## Included

- The map starts with OpenFreeMap **dark** instead of Liberty. The previous style remains available under Map settings. The built-in offline coordinate grid remains available and private. This is a dark style change, **not** a new proprietary/offline tile package.
- The map recenter button now uses dark crosshair strokes on its white background in online and raster modes.
- The destination field supports local saved places and coordinates without any additional services. An autocomplete dropdown uses a configured geocoder if available. Results are *candidate addresses*, not verified delivery points.
- The map-first trip planner is now the first accordion below the map, above Map settings. It defaults to a recent browser position; alternate start addresses, ordered intermediate stops and a destination are editable. Advanced coordinate inputs remain available for testing.
- An **explicit** route request uses `POST /api/navigation/route` to a **locally hosted Valhalla** instance at `127.0.0.1:8002` (override port with `OPENRF_VALHALLA_PORT`). It sends just coordinates, with `costing=auto` and `units=miles`. It never calls a public demo instance.
- Returned route geometry is decoded from Valhalla polyline6 to a teal **road-shaped** overlay; distance, planned duration and step instructions are shown. If the engine or regional road graph is absent, the UI instead shows a **dashed direct-line reference** and an explanatory error, never false road directions.
- Corrected the server's `/static/navigation.js` allowlist, previously preventing the JavaScript preview geometry helper from being served.
- No continuous navigation, voice prompts, traffic, police sightings, radar detection, or Flock avoidance exists in this patch. It does **not** monitor location in the background.

## Address lookup setup (optional)

OpenRF is offline-first. It NEVER sends address searches to a third party unless the operator configures an external provider. Either of these optional options enables address autocomplete:

1. **Locally hosted Photon geocoder:** Start a separate Photon service with licensed/indexed OSM data on the same Linux machine, listening on loopback port 2322. In Ubuntu *before* starting OpenRF, run `export OPENRF_PHOTON_PORT=2322`. OpenRF queries only `http://127.0.0.1:2322/api?...`. Photon binaries or geocoding indexes are not in this release. Refer to https://github.com/komoot/photon for setup/licensing.
2. **Explicit online geocoding:** Set `export OPENRF_MAPTILER_KEY='YOUR_KEY'` **only if you choose** to use MapTiler and agree to its geocoding terms/quotas. This key stays in the shell environment and is not stored in the repository or returned to the browser. Typed address queries then go from the backend to `https://api.maptiler.com/geocoding/...`. Do not paste private access keys into OpenRF UI or Git. Account/billing requirements depend on provider.

Photon takes priority when both are configured. No public Nominatim autocomplete is used (prohibited by the public service's usage policy). A missing or failed geocoder is reported as unavailable; saved places and coordinates still work. Current implementation does not validate every address against a navigable road.

## Local Valhalla setup (optional)

Install or launch an independent Valhalla routing service with a licensed, suitable **regional OSM graph** on loopback port 8002; package provision and preprocessing are outside this ZIP. The default OpenRF backend requests `http://127.0.0.1:8002/route` only when **Route** is clicked. If using another local port, set `export OPENRF_VALHALLA_PORT=8002` with your chosen number. On a Raspberry Pi, memory/storage needed for regional graph generation and actual performance are not yet tested. Up-to-date Valhalla deployment instructions: https://github.com/valhalla/valhalla and https://valhalla.github.io/valhalla/api/route/api-reference/ . There are no automatic remote routing requests, GPS uploads, or live device tests.

## Install and test on Windows / Ubuntu

1. Stop the running OpenRF process with Ctrl+C.
2. Download the complete `OpenRF-v0.2.25.zip` to Windows Downloads.
3. In PowerShell run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`.
4. In Ubuntu run `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
5. Open `http://localhost:8765` and use Ctrl+F5.
6. Confirm the recenter icon is dark on white, the map defaults dark, and the Plan a trip accordion sits before Map settings.
7. Type a saved name or `38.4836, -120.6323` into the destination field. It should draw a **direct** preview and state that Valhalla is unavailable unless installed; it should never silently do nothing.
8. Try adding 2 ordered stops to the trip planner. With a local geocoder, test address suggestions; with local Valhalla, test the teal road route and planned turns; without them verify explicit unsupported messages.

Run regression suite in `project/`:

```bash
python3 -m unittest discover -s tests
node tests/test_frontend.js
node tests/test_navigation_frontend.js
node --check openrf/static/app.js
```

**Limitations:** Browser/UI, actual Valhalla tiles, Photon, MapTiler credentials, Raspberry Pi, and live GPS have not been verified against real devices or services. Python tests mock the local route and geocoder responses. No GPS tracks, private observations, or vendor credentials are bundled; all local user data remains outside Git.
