# Third-party components and attributions

- MapLibre GL JS v5.24.0: BSD-3-Clause, loaded from https://unpkg.com/maplibre-gl@5.24.0/ (requires connectivity for the UI map until packaged locally).
- OpenStreetMap raster tiles (fallback): https://tile.openstreetmap.org/ — online only; follow OSM tile usage policy (no bulk or offline bulk downloading).
- OpenFreeMap street/dark styles and tiles: https://openfreemap.org/ (OpenStreetMap-derived geographic data; attribution displayed in the map).
- Map data © OpenStreetMap contributors under ODbL, via OpenFreeMap. Verify style/tiles usage conditions before distribution or bundling offline data.
- Python standard library: Python Software Foundation License.
- Archived Android libraries carry their own licensing requirements (see `legacy/android-v0.1.6/docs/THIRD_PARTY.md`).

The standalone application's final open-source license has **not** yet been chosen.

- NetworkManager `nmcli`: optional **system-provided** Linux command-line utility; no Python package dependency. Available only on compatible installed Linux distributions, subject to NetworkManager licensing/packaging. Consult distribution terms.
- Browser Geolocation API: native browser feature requiring permission; no third-party location service is bundled.


### v0.2.5 map attribution UI
OpenFreeMap's vector styles and OpenMapTiles/OpenStreetMap underlying geographic data require attribution. OpenRF displays an accessible `ⓘ` **Map credits** control on the map, with direct links to OpenFreeMap (optional credit), OpenMapTiles (CC-BY attribution) and OpenStreetMap contributors (ODbL). Attribution is moved into a compact disclosure to accommodate five-inch screens, not removed. The MapLibre JavaScript library name is not required to appear as an additional mark. If a different map vendor/style is configured later, revisit its attribution and key handling.
