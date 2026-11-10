# OpenRF Linux architecture — 0.2.0

```
Windows browser / Pi Chromium kiosk (planned)
   ↕ Local HTTP / JSON (127.0.0.1)
openrf.server (stdlib HTTP server, read-only static asset hosting)
   ├── openrf.storage (SQLite sessions / observations / export)
   └── openrf.hardware (read-only runtime and radio capability inventory)
       └── SensorBackend interface [implemented drivers: none]
```

- **Backend** runs in Ubuntu WSL or Linux on Raspberry Pi OS. Python 3.11+ standard library only.
- **Frontend** uses HTML/CSS/JS, MapLibre GL JS 6.16.0 and OpenFreeMap styles (online CDN + tiles for now). No credentials or paid map keys.
- **Storage**: `~/.local/share/openrf/openrf.sqlite3`, not tracked by Git. Has source, survey position, RSSI/frequency (nullable), UTC timestamp, notes, kind, identifiers, accuracy, and sessions.
- **Instrument contract**: Hardware drivers will implement `SensorBackend`, advertise capabilities, produce typed readings with original source/timestamp/units, and reject stale/partial measurements. v0.2.0 intentionally registers no RF drivers.
- **Security**: localhost-only, Host and Origin checks, JSON body limits, no authentication, no uploads. Do not open to a network until security design changes. Hardware integration must remain lawful and opt-in.
- **Future**: Linux wireless adapters through appropriate drivers / Kismet integration, BLE BlueZ, RTL-SDR, GNSS, cellular modem, optional ESP32-S3/CC1101, automatic survey correlation, heatmaps, and a touchscreen kiosk image. Preserve separation between observation location and estimated source location; do not place transmitter pins from single RSSI readings.
- **Legacy Android**: archived under `legacy/android-v0.1.6/`; no migration of the phone's Room database (private). Old APK workflow removed from active `.github/workflows`.
