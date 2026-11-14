# OpenRF Linux architecture — 0.2.12

```
Windows browser / Pi Chromium kiosk (planned)
   ↕ Local HTTP / JSON (127.0.0.1)
openrf.server (stdlib HTTP server, read-only static asset hosting)
   ├── openrf.storage (SQLite sessions / observations / export)
   ├── openrf.offline_maps (private raster MBTiles import and tile read)
   ├── openrf.map_areas (private area plans, GeoJSON/XYZ planning, local subsetting)
   ├── openrf.tile_archive (licensed user ZIP import → private raster MBTiles)
   ├── openrf.hardware (read-only host inventory / capability negotiation)
   ├── openrf.sensor_connections (driver registry, scan receipts, validated observations)
   └── openrf.drivers.wifi_nmcli (on-demand NetworkManager AP list only)
       └── Future BlueZ / SDR / GNSS plugins (not implemented)
```

- **Backend** runs in Ubuntu WSL or Linux on Raspberry Pi OS. Python 3.11+ standard library only.
- **Frontend** uses HTML/CSS/JS, MapLibre GL JS 5.24.0 and OpenFreeMap styles (optionally locally cached JS/CSS; online vector tiles). No credentials or paid map keys.
- **Storage**: `~/.local/share/openrf/openrf.sqlite3`, not tracked by Git. Has source, survey position, RSSI/frequency (nullable), UTC timestamp, notes, kind, identifiers, accuracy, and sessions.
- **Instrument contract**: Hardware drivers will implement `SensorBackend`, advertise capabilities, produce typed readings with original source/timestamp/units, and reject stale/partial measurements. v0.2.2 adds one optional NetworkManager AP discovery adapter; no raw RF capture drivers or automatic session measurements.
- **Security**: localhost-only, Host and Origin checks, JSON and local map-upload limits, no authentication, no external uploads. Do not open to a network until security design changes. Hardware integration must remain lawful and opt-in.
- **Future**: Linux wireless adapters through appropriate drivers / Kismet integration, BLE BlueZ, RTL-SDR, GNSS, cellular modem, optional ESP32-S3/CC1101, automatic survey correlation, heatmaps, and a touchscreen kiosk image. Preserve separation between observation location and estimated source location; do not place transmitter pins from single RSSI readings.
- **Legacy Android**: archived under `legacy/android-v0.1.6/`; no migration of the phone's Room database (private). Old APK workflow removed from active `.github/workflows`.

## v0.2.1 reliability and inventory

- The browser uses MapLibre GL JS 5.24.0 classic bundle to load OpenFreeMap vector street styles. If unavailable or explicitly requested, a self-contained Web Mercator raster/coordinate fallback still supports pan/zoom, manual observation placement and saved survey markers. The fallback never fetches OSM public raster tiles: it draws a local coordinate grid or uses user-provided raster MBTiles files read-only via openrf.offline_maps. See OFFLINE_MAPS.md.
- UI layout uses a top-aligned Grid child (`margin: 0 auto`, `align-self: stretch`) rather than auto centering. Navigation also resets page scroll position.
- `hardware.status_report()` reads Linux sysfs USB descriptor IDs (not serial numbers), network and Bluetooth interface names, and device serial endpoint names. A driver contract exists but no sensor backend captures live RF. The inventory is evidence about system visibility, not radio capability or live measurements.

## v0.2.2 additions

- Browser geolocation is permission-gated and kept in browser memory. Map auto-centers when opening for the first time; accuracy determines zoom. A blue dot indicates only browser position, never a transmitter or a persisted observation. Raster/vector switching now preserves camera position.
- `POST /api/wifi/scan` triggers exactly one explicit NetworkManager Wi-Fi discovery if Linux exposes a wireless interface. Returns ephemeral AP listing with SSID/BSSID/frequency/channel/security/quality %, not RSSI dBm. Result freshness is unverified; NetworkManager may return cache and may send ordinary probe requests. Scans rate-limited 15s. No GPS, passive packet sniffing, background capture or automatic persistence. Tests use a stubbed `nmcli`. See `docs/NATIVE_WIFI_DRIVER.md`.

## v0.2.3 touchscreen and map layer separation

- Responsive frontend adds a 5-inch bottom application navigation and a map-sheet UI. Saved survey category filters are local view state only, not SQLite changes. Desktop Overview and detailed Analysis remain available.
- `mapVisibleObservations()` requires finite, stored survey latitude/longitude and a selected category before creating vector GeoJSON or raster markers. `DEMO` records require explicit opt-in. Marker colors are category labels, not classification confidence or probable source locations.
- NetworkManager's one-shot result list is ephemeral and unlocated; the shared scan function renders it either in Analysis or the map drawer, **never as map pins**. GPS browser geolocation is local to the browser and is never implicitly attached to scan results.
- No driver API, session storage, SQLite schema, backend capture or API authorization changed.

## v0.2.5 handheld navigation

A top-left hamburger opens an accessible fixed vertical drawer on compact/touch layouts, leaving desktop persistent navigation unchanged. Measurement tables are rendered as labeled cards on small viewports. No API or database change.

## v0.2.5 — Sensor observation pipeline

- `GET /api/sensors` returns declared adapter statuses. `networkmanager-wifi` may be ready if a Linux wireless interface and `nmcli` are detected, but actual scan success still depends on OS/driver permissions. BLE/SDR/GNSS show `not_implemented` rather than fabricated readiness.
- `POST /api/wifi/scan` is still explicitly user-started, at most once per 15 seconds; on success it now also generates a random 10-minute receipt stored in server memory. The receipt contains the actual NetworkManager result, not client-supplied network metadata.
- `POST /api/sensors/networkmanager-wifi/save` accepts `{scan_id, bssid, survey_location?, session_id?}` and saves only a matching BSSID in that server-owned scan. One save per BSSID per scan. Errors and scan expiry do not produce observations. No automatic scanning or record writing occurs.
- Records use source `SENSOR`, source device `Linux NetworkManager / <interface>`, and the original UTC **retrieval** timestamp. NetworkManager `SIGNAL` is **quality percent**, and remains in notes, not the `rssi_dbm` column. Cached beacon age is unknown; stale flags and GPS fix are not asserted. Optional browser coordinates are observer positions and explicitly marked as client-reported, not independently verified GNSS.
- The current typed record format is a compatibility boundary for future dedicated modules. New drivers must prove their hardware identity, timestamp, unit, freshness and survey location quality before being allowed to save measured values. See `docs/SENSOR_CONNECTIONS.md`.
- Map credits remain on-map in an accessible disclosure. OpenFreeMap/OpenMapTiles/OSM attribution cannot be removed just to save space. MapLibre uses online vector tiles; local raster MBTiles are user-supplied and have their own attribution.

## v0.2.6 — atomic survey snapshots

`openrf.sensor_connections.ScanReceiptStore` holds short-lived, single-use server scan receipts in memory. Only `wifi_nmcli.scan_once()` can issue a receipt. A save-scan request is resolved to server-owned records and converted using `verified_wifi_observation()`, then persisted through `Repository.store_wifi_capture()` in one SQLite transaction. The database has additive `survey_captures` and observation quality/provenance columns. An interrupted or invalid save cannot write half a batch. Captures may have zero signal observations, which records only that a scan retrieval occurred. Browser survey position is optional, origin-labeled and sampled before the request; transmitter positions are not inferred. See `docs/SENSOR_CONNECTIONS.md`.

## v0.2.11 map area planning

Area plans are independent of observation SQLite. API `/api/maps/areas` saves bounded user-selected geography to private JSON; `/api/maps/areas/<id>.geojson` exports an optional area polygon and `/api/maps/areas/<id>/build` creates an atomic, no-overwrite local raster MBTiles subset from a licensed installed source. No map fetching is performed. Source tile rows are MBTiles TMS; UI map bounds are Web Mercator and XYZ. Bounds are selected regions, not RF source location estimates. See `docs/OFFLINE_MAPS.md`.

## v0.2.12 local tile source boundary

`POST /api/maps/areas/{id}/import-xyz` consumes only a browser-selected `application/zip` (or `application/octet-stream`) file body; it never accepts remote URLs or fetches map tiles. Fields are local request headers and the previously saved plan ID. Files are bounded and staged outside source control, validated without extracting paths, clipped, translated to MBTiles TMS row numbering, and atomically linked to a new name. A confirmation checkbox is an operator attestation, **not** automated map-provider license verification. `GET /api/maps/areas/{id}.plan.json` returns a provider-neutral planning descriptor without remote URLs or map tiles. Maps and plans are stored separately from investigations.

## v0.2.53 local radio boundary

`openrf.radio.RadioReceiver` is independent of persistent observations and spectrum CSV files. `POST /api/radio/start` accepts a fixed frequency/mode/duration schema and starts a short receive-only `rtl_fm` subprocess when installed. Stop and timeout are bounded. A single last WAV buffer lives **only in process memory**, retrievable via an unguessable loopback audio endpoint. Opening the UI does not start receiving. No geolocation association, speaker microphone access, transmitter controls, identity or hardware availability claims. The startup mutex blocks overlapping RTL-SDR spectrum sweeps and radio listening within OpenRF; another external program may still own the dongle.
