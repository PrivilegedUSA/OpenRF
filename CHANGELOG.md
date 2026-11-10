# Changelog

## v0.2.1 — Map recovery, UI spacing, and hardware inventory

- Fixed MapLibre 6 classic-script mismatch by pinning the compatible MapLibre GL JS 5.24.0 UMD distribution. OpenFreeMap Liberty/Dark styles remain the primary online map.
- Added an independent in-app raster/coordinate map fallback (no JavaScript CDN dependency). It tries OSM raster street tiles online, and shows a functional coordinate grid, manual map-click observations and saved pins without them. Added a manual raster/vector switch. No offline street basemap is bundled.
- Corrected CSS grid vertical centering of the main pane: Overview, Map, Scanner, Discoveries, Investigations, and Hardware headers now align consistently. Added spacing above Scanner measurement records.
- Added read-only Linux USB descriptors, serial endpoints, network and Bluetooth interface visibility to Hardware; USB serial numbers are deliberately excluded. Refresh button does not initiate scanning.
- Added regression tests for hardware inventory, map projection, CSS consistency, and browser fallback behavior. No changes to SQLite schema or private records.
- No real RF sensor/driver integration yet. Hardware inventory is not equivalent to signal detection.

## v0.2.0 — Linux/Raspberry Pi foundation

- Replaced Android APK as the primary target with a local Linux service and browser-based UI for WSL and future Raspberry Pi use.
- Added local SQLite survey observations, manually started/finished investigations, search/filter/delete, RSSI history visualization, CSV and GeoJSON exports, and map-based manual observation entry.
- Added read-only Linux/WSL hardware capability inventory, a sensor driver protocol stub, explicit unsupported/unconnected RF states and synthetic-demo opt-in.
- Added GitHub Linux test workflow (Python 3.11 and 3.14), startup scripts for Windows PowerShell/Ubuntu, and test/documentation suite.
- Archived v0.1.6 Android source without replacing private phone data or claiming conversion of the Android Room database.
- Removed the obsolete active Android APK workflow. Existing Windows updater will still display its old, hardcoded success message about APKs.

See `legacy/android-v0.1.6/CHANGELOG.md` for versions 0.1.0–0.1.6.
