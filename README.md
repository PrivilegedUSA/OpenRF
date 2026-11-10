# OpenRF v0.2.2 — GPS Map & On-demand Linux Wireless Discovery

OpenRF is a local-first, open-source RF and geographic investigation platform intended for **WSL development now and a self-contained Raspberry Pi field instrument later**. The previous Android v0.1.6 source has been preserved under `legacy/android-v0.1.6/` but is no longer the primary application.

**No external RF sensor is required to run the interface.** Scanner signal history shows only manually saved records and explicitly labeled synthetic demonstrations. On a supported native Linux host, a separately requested NetworkManager Wi-Fi access-point list can display real but potentially cached results temporarily; this functionality has not been tested with physical RF hardware. Hardware inventory is real and read-only; detecting a Linux network adapter is not proof that a scanner driver is ready. GPS coordinates belong to the observer/survey position, not an inferred transmitter position.

## Install/update via the existing Windows updater

1. Download `OpenRF-v0.2.2.zip` into Windows Downloads.
2. In PowerShell (from any folder), run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

3. The local updater installs to `C:\projects\OpenRF`, creates a Git commit of managed paths, and pushes by default. Its output still says **"Android APK workflow"**, because that wording is hardcoded in the reserved updater. For v0.2.2 the actual trigger is `.github/workflows/openrf-linux.yml` instead. The old Android workflow is intentionally retired; **no Android APK is produced by this release**.
4. Run from the Ubuntu terminal:

   ```bash
   cd /mnt/c/projects/OpenRF
   python3 -m openrf
   ```

   Or run from Windows PowerShell:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Start-OpenRF.ps1'
   ```

5. In a **Windows browser**, open **http://localhost:8765**. Keep the Ubuntu/PowerShell terminal open while using OpenRF; press Ctrl+C to stop.

No Python packages or virtual environment are required. Python 3.11 or newer is recommended; the supplied WSL Python 3.14 works with this standard-library backend.

## Working features

- **Dashboard:** Real counts from locally stored records and explicit environment status. No invented scan results.
- **Map:** Automatically requests browser geolocation on first visit (requires explicit permission), adds separate location marker and accuracy-aware street-level zoom; never saves browser position. MapLibre 5 with OpenFreeMap street/dark vector maps when the resources load, or an independent built-in raster map if they do not. The fallback attempts OpenStreetMap raster street tiles online but can show manual survey pins and an interactive coordinate grid completely offline. The fallback is not an offline street basemap. Map clicks create manual observations at the survey coordinate.
- **Discoveries:** Save/delete manually entered signal or infrastructure observations, with coordinates, source label, timestamps, optional RSSI/frequency/identifier, and provenance. Coordinates always refer to survey location.
- **Investigations:** User-started local sessions; manually entered observations can be linked to an active session. Start/stop/review history; a prior ACTIVE session is marked INTERRUPTED after a process restart. No background capture or travel tracking.
- **Native Linux Wi-Fi survey (new):** On-demand `nmcli` access-point list if a Linux Wi-Fi interface is visible. No background scans; NetworkManager may use active probe frames and may return cached entries. SSID/BSSID, channel, frequency, security, and signal **quality %** are shown temporarily. Results are not GPS positions, RSSI dBm, or stored records. See `docs/NATIVE_WIFI_DRIVER.md`. WSL with no Linux radio returns a clear unavailable error.
- **Signal analysis:** Inspect saved BLE/Wi-Fi/RF/cellular-labeled observations and plot RSSI history by recorded identifier. Manually entered RSSI values remain labeled `MANUAL`; they are not a true measurement from a connected device.
- **Hardware:** Read-only visibility of real Linux USB descriptors, USB serial ports, network and Bluetooth interfaces, plus unconnected/planned sensor integrations (SDR, BLE, Wi-Fi, GNSS, CC1101 and external cellular modem). No driver availability is falsely inferred from an interface name.
- **Exports:** Local CSV and GeoJSON with source and observer-location semantics. CSV escapes spreadsheet-formula injection. Nothing is uploaded automatically.
- **Optional demo data:** A user-triggered synthetic sample set marked DEMO everywhere, hidden from map/discoveries by default; remove via Dashboard.

## Test the app before buying hardware

1. Visit Overview; confirm all counts initially zero on a fresh WSL install.
2. Visit Survey Map. An online map library and tiles provide street detail; if unavailable, use the built-in raster/coordinate fallback. Click a point or use **Add observation manually**; save a labeled note. Confirm map marker and Discoveries list. On first opening Map, the browser asks for location permission (if not previously granted/denied); with a usable fix it centers automatically. If location is blocked, unavailable, or coarse on desktop/VPN, you can still pan or use “My browser location”.
3. Start an Investigation; create another observation and confirm it appears in the session's Records view. Stop the session. Refresh the page and verify persistence.
4. Download CSV and GeoJSON; verify the saved note and the explicit `coordinate_meaning` field. Check the private database exists under `~/.local/share/openrf/openrf.sqlite3` on Linux. It is **not** inside the Git repository.
5. Check Hardware for `WSL 2 / Linux` and explicit unavailable/not-connected states. Do not expect Linux WSL to capture built-in Wi-Fi or Bluetooth devices.
6. Optional: Load synthetic demo data and check Signal History graph. Confirm demo is labeled and hidden by default on the map. Clear the demo before field use.
7. Shut down Ctrl+C and rerun; verify saved records survive. Active sessions should be marked INTERRUPTED, not silently resumed.

## Testing and privacy limits

- Backend uses Python standard library + SQLite only. GitHub Actions tests Python 3.11 and 3.14 and checks JavaScript syntax. It does **not** build an APK.
- The server binds only to 127.0.0.1 and validates request Host/Origin. It is not an authenticated multi-user server or a safe public internet service. Do not expose its port to untrusted networks.
- Street names and detailed basemaps still need internet for MapLibre/OpenFreeMap or OSM raster tiles. The built-in fallback draws an interactive coordinate grid and survey markers without internet or external JavaScript. There is no downloaded offline street atlas yet. Data storage and API do not need network access.
- Continuous/background Wi-Fi capture, raw frame monitoring, BLE, SDR, cellular modem integration, hardware GPS, RF heatmaps, advanced localization, road navigation, and a Raspberry Pi kiosk installer are future work; no unverified detection or hardware capability is claimed.
- Current sessions store manually entered observations, not automatically collected scan cycles. Data is not migrated from the Android Room database automatically; the prior Android app and its local phone database are left untouched.
- The old Android workflow is retired on deployment, but the old source is preserved. To continue Android development later, use that archived source, not the Linux application bundle.

## Local developer tests

```bash
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests -v
python3 -m compileall -q openrf
node tests/test_frontend.js
```

Detailed architecture: `docs/ARCHITECTURE.md`. License selection is pending; do not publish the repository as reusable open-source code until an actual license is selected and all dependency terms have been reviewed.

## v0.2.1 layout/map fixes retained

- The old map was using the wrong kind of MapLibre 6 script. This release references a compatible classic MapLibre 5 distribution.
- If browser extensions, VPN, or network policies block MapLibre, the raster fallback appears automatically; use **Raster fallback**/**Try vector map** to switch manually. In raster mode the city/street map imagery is loaded from `tile.openstreetmap.org`; if that is blocked, a grid and saved survey markers still work.
- Opening Survey Map automatically requests browser location once; the button can retry manually. Neither stores GPS coordinates. WSL cannot supply actual GPS fixes without appropriate hardware.
- All page headers now top-align; the scanner's records panel has 20px separation from the two panels above it.
- Open **Hardware → Detected host devices** to inspect USB descriptors and Linux-visible interfaces. These read-only entries do not prove that a radio device is supported or operational. `Refresh inventory` doesn't run a wireless scan.
- Stop/restart the OpenRF Python server after installing new source; press `Ctrl+C` in Ubuntu and rerun `python3 -m openrf`. Refresh your Windows browser with `Ctrl+F5` to discard previous scripts.

## v0.2.2 validation walkthrough

1. Survey Map should request browser geolocation once upon first opening. If allowed, it recenters (zoom 15 with a reasonably accurate fix). A blue location marker is **not** an observation or an RF transmitter. On Windows/VPN a browser fix might be approximate. No coordinates are saved or transmitted to the OpenRF backend by this step.
2. Toggle Raster fallback / Try vector map; center and zoom should persist. Both modes support the geolocation marker and manual observations.
3. Scanner → Scan Wi-Fi once: on your current WSL machine with only `eth0`, expect “No Linux Wi-Fi interface is visible”; do not expect fabricated nearby networks. If a native Linux Wi-Fi adapter + NetworkManager is available, it returns a temporary access-point list. This is a manually invoked scan, possibly active probing, not continuous capture.
4. Hardware → Confirm Wi-Fi readiness message matches the Linux interface inventory.
5. Check observations, investigations and exports from v0.2.1 survive; no database migration. Use `python3 -m unittest discover -s tests -v` and `node tests/test_frontend.js`.

The one-shot driver was tested with mocked NetworkManager responses, **not physical RF hardware**, and the site behavior was checked with a fixture browser location, **not an actual Windows location fix**.
