# OpenRF Maps — Third-party data, tools, and attribution

These components are separate dependencies. This prototype ZIP does not bundle copies of the listed geographic databases, MapLibre JS libraries, or glyph binaries.

- **OpenStreetMap geographic data**, © OpenStreetMap contributors. Data is made available under the [Open Database License 1.0](https://www.openstreetmap.org/copyright). Geographic source for the region builder: [Geofabrik Northern California](https://download.geofabrik.de/north-america/us/california/norcal.html). Keep attribution visible in both light and dark offline styles.
- **Tilemaker**: [systemed/tilemaker](https://github.com/systemed/tilemaker), generated in WSL with its own project license (FTWPL); its OpenMapTiles-compatible Lua/configuration files are downloaded from a pinned `v2.4.0` Git tag by the build script. Review this upstream repository when redistributing packaged outputs.
- **MapLibre GL JS 4.7.1**: downloaded from its CDN as a local runtime asset. Project: [maplibre/maplibre-gl-js](https://github.com/maplibre/maplibre-gl-js), BSD-3-Clause. Retain upstream notice/licenses in production distributions.
- **Noto Sans Regular glyphs**: obtained during setup from OpenFreeMap font endpoints; associated Noto font families have SIL Open Font License licensing. Review exact upstream glyph hosting terms before redistribution; no actual font files are bundled here.
- **Online OpenFreeMap tiles**: not redistributed in this ZIP or generated offline by this build. Their service terms are at [openfreemap.org/tos](https://openfreemap.org/tos/); offline downloads have limits and cannot be treated as permission for bulk mirroring.

OpenRF's own code license for a public distribution has not been selected in this standalone prototype.
