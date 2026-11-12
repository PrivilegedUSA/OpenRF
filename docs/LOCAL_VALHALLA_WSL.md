# Local Valhalla on Ubuntu / WSL2 — optional road-routing setup

OpenRF v0.2.27 includes a local routing adapter and a setup helper. **The ZIP does not contain Valhalla, Docker, street address data, or road graphs.** A dashed line is not a road route. The command below is an explicit optional installation; nothing auto-downloads after you install OpenRF.

## Requirements

- Windows 11 + Ubuntu WSL2, with **Docker Desktop + WSL Integration enabled for Ubuntu** (or an installed/running Linux Docker daemon). `docker info` inside Ubuntu must work.
- `curl` inside Ubuntu and internet access to download the container and OSM file.
- At least 8 GiB of free disk space is recommended for Northern California; routing tiles and image layers can require additional space. First graph creation can consume substantial CPU/RAM. Limit for initial testing to Northern California rather than the full United States.
- OSM data coverage is only the selected extract. Destinations outside its coverage cannot be routed. This is not traffic-aware or active turn-by-turn guidance.

## Commands (run in Ubuntu, not PowerShell)

```bash
cd /mnt/c/projects/OpenRF
bash tools/setup-valhalla-wsl.sh --status
bash tools/setup-valhalla-wsl.sh --install
bash tools/setup-valhalla-wsl.sh --logs
bash tools/setup-valhalla-wsl.sh --status
```

`--install` explicitly downloads `norcal-latest.osm.pbf` from [Geofabrik Northern California](https://download.geofabrik.de/north-america/us/california/norcal.html) to `~/.local/share/openrf/valhalla/` (or `OPENRF_VALHALLA_DATA_DIR` if set), then starts the official [Valhalla scripted Docker image](https://github.com/valhalla/valhalla/blob/master/docker/README.md). It takes care of processing the PBF into routing tiles in that same **private** directory. The script does not put map data or credentials into the OpenRF Git repository. It binds the service to `127.0.0.1:8002`, never to all LAN interfaces.

If your container already exists, `--start` restarts it without downloading. `--stop` stops it without deleting private tiles, and `--logs` displays current build messages. `--status` reports whether its HTTP service responds. **HTTP status alone doesn't prove adequate graph coverage**; test a local route in the app to confirm.

## Verify service and app

```bash
curl --fail --max-time 5 http://127.0.0.1:8002/status
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

Open **http://localhost:8765**, select **Map → Plan a trip → Check local routing service**. Choose a local saved place or U.S. street address from address suggestions (needs a configured/opt-in geocoder), then **Start navigation** to request a road *plan*. Real roads show a solid polyline and planned turns; a dashed line with a warning means no drivable route was obtained. **No live GPS tracking or voice guidance is implemented yet.**

## Address suggestions are separate

- Valhalla does **not** convert text addresses into coordinates. To use street addresses you need Photon, MapTiler, or a saved destination. The UI has an opt-in public Photon fallback. It is a fair-use demonstration service and may be unavailable or throttled; it is not an always-on address-search guarantee. MapTiler requires your own key (`OPENRF_MAPTILER_KEY`) and connectivity. An offline Photon service may require considerable disk and memory. Coordinate or saved-place routing still works when the geocoder is unavailable.
- All Photon and MapTiler queries now include a **United States country filter**. OpenRF will not automatically choose a fuzzy first result; select a suggestion to confirm the destination. Public Photon receives the typed query only after you opt in. Your browser GPS coordinates are not sent to the public geocoder.

## Licensing and limitations

Geofabrik extracts are OSM-derived and subject to [OpenStreetMap ODbL attribution and database terms](https://www.openstreetmap.org/copyright). Display © OpenStreetMap contributors in products and exported maps derived from this data. Valhalla is open source; see the upstream LICENSE file. Routing road graphs and cached data are separate from basemap tile packages; installing Valhalla **does not automatically install an offline map basemap**. No claims about live road closures, police location, radar detections, police avoidance, route reliability or safe driving are made.

This Docker workflow is prepared but **was not run on your WSL installation or tested against a real regional graph** in this release. Verify Docker prerequisites before installation. Valhalla plans are only useful where road tiles are covered and correct; keep a normal navigation solution for driving until OpenRF guidance has been field tested.
