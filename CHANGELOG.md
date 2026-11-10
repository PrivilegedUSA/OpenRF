# Changelog

## v0.2.0 — Linux/Raspberry Pi foundation

- Replaced Android APK as the primary target with a local Linux service and browser-based UI for WSL and future Raspberry Pi use.
- Added local SQLite survey observations, manually started/finished investigations, search/filter/delete, RSSI history visualization, CSV and GeoJSON exports, and map-based manual observation entry.
- Added read-only Linux/WSL hardware capability inventory, a sensor driver protocol stub, explicit unsupported/unconnected RF states and synthetic-demo opt-in.
- Added GitHub Linux test workflow (Python 3.11 and 3.14), startup scripts for Windows PowerShell/Ubuntu, and test/documentation suite.
- Archived v0.1.6 Android source without replacing private phone data or claiming conversion of the Android Room database.
- Removed the obsolete active Android APK workflow. Existing Windows updater will still display its old, hardcoded success message about APKs.

See `legacy/android-v0.1.6/CHANGELOG.md` for versions 0.1.0–0.1.6.
