# Third-party components and attributions

- MapLibre GL JS v5.24.0: BSD-3-Clause, optionally downloaded explicitly by `tools/cache-maplibre.py` into local private data from https://unpkg.com/maplibre-gl@5.24.0/; otherwise redirected to upstream CDN. No library binary is included in this release. Cached JavaScript/CSS do not include vector basemap tiles.
- OpenStreetMap public raster tiles: **not accessed** by OpenRF raster fallback. Offline prefetching from https://tile.openstreetmap.org/ is forbidden by the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
- OpenFreeMap street/dark styles and tiles: https://openfreemap.org/ (OpenStreetMap-derived geographic data; attribution displayed in the map).
- Map data © OpenStreetMap contributors under ODbL, via OpenFreeMap for online vectors. Operator-supplied raster MBTiles must carry their own licensing and attribution; OpenRF does not provide offline map data. Verify redistribution/offline rights before using third-party archives.
- Python standard library: Python Software Foundation License.
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
- **FlockHopper / DeFlock community OSM-derived daily GeoJSON data** (https://github.com/flockhopper3/deflock-data; fixed public endpoint https://data.dontgetflocked.com/cameras.geojson.gz) is accessed only on explicit user request. Availability, rights and policies should be checked before redistribution; imported positions are NOT shipped inside this software ZIP. Operator-approved imports are stored in private local SQLite. Distinguish the MIT license on some client software from **OpenStreetMap's ODbL database licensing**: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright. Derived-data distribution may trigger ODbL share-alike obligations; do not upload or redistribute private merged datasets without checking terms.
- Red-light and speed camera categories are manual-data foundations only; no third-party red-light or speed datasets are bundled.
- **CHIRP** (https://chirpmyradio.com/) is independently installed software for downloading/configuring compatible radio channels; OpenRF reads its exported CSV files only, and does not bundle or invoke CHIRP or write to a radio.
