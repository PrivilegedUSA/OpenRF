# OpenRF Linux architecture — 0.2.5

```
Windows browser / Pi Chromium kiosk (planned)
   ↕ Local HTTP / JSON (127.0.0.1)
openrf.server (stdlib HTTP server, read-only static asset hosting)
   ├── openrf.storage (SQLite sessions / observations / export)
   ├── openrf.hardware (read-only host inventory / capability negotiation)
   ├── openrf.sensor_connections (driver registry, scan receipts, validated observations)
   └── openrf.drivers.wifi_nmcli (on-demand NetworkManager AP list only)
       └── Future BlueZ / SDR / GNSS plugins (not implemented)
```

- **Backend** runs in Ubuntu WSL or Linux on Raspberry Pi OS. Python 3.11+ standard library only.
- **Frontend** uses HTML/CSS/JS, MapLibre GL JS 5.24.0 and OpenFreeMap styles (online CDN + tiles for now). No credentials or paid map keys.
- **Storage**: `~/.local/share/openrf/openrf.sqlite3`, not tracked by Git. Has source, survey position, RSSI/frequency (nullable), UTC timestamp, notes, kind, identifiers, accuracy, and sessions.
- **Instrument contract**: Hardware drivers will implement `SensorBackend`, advertise capabilities, produce typed readings with original source/timestamp/units, and reject stale/partial measurements. v0.2.2 adds one optional NetworkManager AP discovery adapter; no raw RF capture drivers or automatic session measurements.
- **Security**: localhost-only, Host and Origin checks, JSON body limits, no authentication, no uploads. Do not open to a network until security design changes. Hardware integration must remain lawful and opt-in.
- **Future**: Linux wireless adapters through appropriate drivers / Kismet integration, BLE BlueZ, RTL-SDR, GNSS, cellular modem, optional ESP32-S3/CC1101, automatic survey correlation, heatmaps, and a touchscreen kiosk image. Preserve separation between observation location and estimated source location; do not place transmitter pins from single RSSI readings.
- **Legacy Android**: archived under `legacy/android-v0.1.6/`; no migration of the phone's Room database (private). Old APK workflow removed from active `.github/workflows`.

## v0.2.1 reliability and inventory

- The browser uses MapLibre GL JS 5.24.0 classic bundle to load OpenFreeMap vector street styles. If unavailable or explicitly requested, a self-contained Web Mercator raster/coordinate fallback still supports pan/zoom, manual observation placement and saved survey markers. Tiles are fetched online from OpenStreetMap only when available; this is not an offline tile cache.
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
- Map credits remain on-map in an accessible disclosure. OpenFreeMap/OpenMapTiles/OSM attribution cannot be removed just to save space. The map has not yet been packaged for offline street tiles.
