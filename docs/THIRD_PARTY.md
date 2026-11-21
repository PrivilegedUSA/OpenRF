# Third-party components and attributions

- **MeshCore Python Companion SDK:** Optional `meshcore` Python package (official [`meshcore-dev/meshcore_py`](https://github.com/meshcore-dev/meshcore_py), MIT license). Not bundled in OpenRF; operator installs separately in the active Linux Python interpreter. `MeshCore.create_serial()`, contact retrieval, receive events and expected-ACK matching are used only after explicit radio connection. MeshCore Companion firmware is independently installed on compatible hardware; OpenRF does not redistribute it. See `docs/MESHCORE_INTEGRATION_PLAN.md`.
- MapLibre GL JS v5.24.0: BSD-3-Clause, optionally downloaded explicitly by `tools/cache-maplibre.py` into local private data from https://unpkg.com/maplibre-gl@5.24.0/; otherwise redirected to upstream CDN. No library binary is included in this release. Cached JavaScript/CSS do not include vector basemap tiles.
- OpenStreetMap public raster tiles: **not accessed** by OpenRF raster fallback. Offline prefetching from https://tile.openstreetmap.org/ is forbidden by the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
- USGS The National Map **USGSTopo** (https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer): optional operator-selected online basemap. v0.2.144 can download **small, explicitly approved, bounded regional tile sets** as privately stored raster MBTiles under the local maps directory. The provider receives selected map tile coordinates; existing attribution is preserved. No OpenStreetMap public tile requests are used by this feature. Before redistributing USGS composite tiles, review any embedded third-party content/attribution (including OSM-derived data).
- USGS **3D Elevation Program (3DEP) Elevation Point Query Service** (https://epqs.nationalmap.gov/v1/docs): optional operator-triggered route terrain samples. Exactly the 13 sampled route coordinates go to this service only after permission. Numerical results are interpolated modeled terrain elevation, not GPS or surveyed ground heights; accuracy varies with source. Privately cached samples are available offline for the same route; a full offline DEM is not included.
- **Operator-imported HGT DEM data** (v0.2.145): OpenRF understands standard 1×1-degree, 16-bit signed big-endian `.hgt` tiles compatible with NASA SRTM and similar sources. **No elevation grid is bundled, fetched or redistributed** by OpenRF. The operator supplies the file and a provenance label and remains responsible for its license, attribution, source confidence, coverage, vertical reference, and data quality. See [NASA SRTM overview](https://www.earthdata.nasa.gov/data/instruments/srtm) and any applicable source-specific use terms. A HGT format match does not authenticate a file as NASA data.
- OpenFreeMap street/dark styles and tiles: https://openfreemap.org/ (OpenStreetMap-derived geographic data; attribution displayed in the map).
- Map data © OpenStreetMap contributors under ODbL, via OpenFreeMap for online vectors. Operator-supplied raster MBTiles must carry their own licensing and attribution; OpenRF does not provide offline map data. Verify redistribution/offline rights before using third-party archives.
- Python standard library: Python Software Foundation License.
- Font Awesome Free v6.7.2 Classic Solid icons **car-side**, **person-walking** and **location-arrow**, copyright 2024 Fonticons, Inc.; SVG icons under **CC BY 4.0** (https://fontawesome.com/license/free). Two icons are embedded in the destination mode buttons and the local location-arrow SVG is shipped with the app. Attribution comments are retained. No remote icon font, CDN dependency or Pro assets are required.
- Archived Android libraries carry their own licensing requirements (see `legacy/android-v0.1.6/docs/THIRD_PARTY.md`).

The standalone application's final open-source license has **not** yet been chosen.

- NetworkManager `nmcli`: optional **system-provided** Linux command-line utility; no Python package dependency. Available only on compatible installed Linux distributions, subject to NetworkManager licensing/packaging. Consult distribution terms.
- Browser Geolocation API: native browser feature requiring permission; no third-party location service is bundled.


### v0.2.5 map attribution UI
OpenFreeMap's vector styles and OpenMapTiles/OpenStreetMap underlying geographic data require attribution. OpenRF displays an accessible `ⓘ` **Map credits** control on the map, with direct links to OpenFreeMap (optional credit), OpenMapTiles (CC-BY attribution) and OpenStreetMap contributors (ODbL). Attribution is moved into a compact disclosure to accommodate five-inch screens, not removed. The MapLibre JavaScript library name is not required to appear as an additional mark. If a different map vendor/style is configured later, revisit its attribution and key handling.

## Optional v0.2.25 routing and geocoding

- **Valhalla**: open-source routing engine, MIT license, separate installation with OSM-derived road data/attribution. https://github.com/valhalla/valhalla
- **Photon**: optional separately hosted OSM search/geocoder; review its license and OSM attribution when deploying. https://github.com/komoot/photon
- **MapTiler Geocoding**: optional account/API-key based external provider with independent service terms and quota limits; not bundled and never queried unless configured. https://docs.maptiler.com/cloud/api/geocoding/
- Public OSM Nominatim is not used for autocomplete because its usage policy forbids that use. https://operations.osmfoundation.org/policies/nominatim/

## Optional receive-only radio dependencies (v0.2.53)

- `rtl_fm` is part of the **Osmocom rtl-sdr** suite; installed separately from the Linux distribution (for Ubuntu: `sudo apt install rtl-sdr`), not copied into the OpenRF ZIP. Upstream: https://github.com/osmocom/rtl-sdr ; see upstream GPL-2.0-or-later license information and distribution package terms. Compatible RTL2832U hardware and a suitable antenna are required for actual reception.
- OpenRF uses only the externally installed executable and decodes its signed 16-bit PCM output into WAV via Python stdlib. No external audio libraries, remote services or pre-recorded third-party audio are bundled.
- RTL-SDR receive-only capabilities do not authorize transmission. Monitoring and recording requirements vary by country, state and radio service; comply with applicable law.

## Optional v0.2.54 public ALPR map data

- **DeFlock** (https://deflock.org/) is an independent community project mapping public ALPR camera locations via **OpenStreetMap** tagging; the map is not an official Flock Safety camera registry.
- **OpenStreetMap / Overpass API** (https://wiki.openstreetmap.org/wiki/Overpass_API) powers the optional, user-triggered v0.2.55 ALPR import using OSM surveillance tags also consumed by DeFlock/FlockHopper. Unlike v0.2.54, OpenRF now queries only the selected map bounds rather than downloading a national feed; that bounds rectangle is shared with the OSM Overpass service when the operator clicks Import. No live RF data, personal travel histories, or background GPS tracking is transmitted. Queries can fail due to OSM/Overpass server availability, usage limits or incomplete tagging; no results does not mean no cameras. Retrieved positions are community-reported and retained privately in SQLite. © OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright. The OpenRF app does not redistribute a bulk camera dataset. Check ODbL obligations before republishing derived data.
- **DeFlock / FlockHopper** (https://deflock.org/ and https://github.com/flockhopper3/deflock-data) use the same OSM tags. Their older national snapshot endpoint (`https://data.dontgetflocked.com/cameras.geojson.gz`) was used in v0.2.54 but is **not downloaded in v0.2.55**; v0.2.54 may have failed its bounded-size check when the national file grew.
- Red-light and speed camera categories are manual-data foundations only; no third-party red-light or speed datasets are bundled.
- **CHIRP** (https://chirpmyradio.com/) is independently installed software for downloading/configuring compatible radio channels; OpenRF reads its exported CSV files only, and does not bundle or invoke CHIRP or write to a radio.
