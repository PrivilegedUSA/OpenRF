# OpenRF v0.2.13 — Smooth Browser Location Flyover

OpenRF is a local-first, open-source RF and geographic investigation platform intended for **WSL development now and a self-contained Raspberry Pi field instrument later**. The previous Android v0.1.6 source has been preserved under `legacy/android-v0.1.6/` but is no longer the primary application.

**No external RF sensor is required to run the interface.** Scanner signal history shows only manually saved records and explicitly labeled synthetic demonstrations. On a supported native Linux host, a separately requested NetworkManager Wi-Fi access-point list can display real but potentially cached results temporarily; this functionality has not been tested with physical RF hardware. Hardware inventory is real and read-only; detecting a Linux network adapter is not proof that a scanner driver is ready. GPS coordinates belong to the observer/survey position, not an inferred transmitter position.

## Install/update via the existing Windows updater

1. Download `OpenRF-v0.2.13.zip` into Windows Downloads.
2. In PowerShell (from any folder), run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

3. The local updater installs to `C:\projects\OpenRF`, creates a Git commit of managed paths, and pushes by default. Its output still says **"Android APK workflow"**, because that wording is hardcoded in the reserved updater. For v0.2.13 the actual trigger is `.github/workflows/openrf-linux.yml` instead. The old Android workflow is intentionally retired; **no Android APK is produced by this release**.
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

## v0.2.13 — Smooth location camera and simple map start

- Opening the Survey Map still starts on a U.S. overview when there is no previously chosen map view. After browser location permission is accepted and a fix is obtained, MapLibre smoothly pans and zooms to the browser-reported position with a bounded flight instead of snapping instantly.
- A fix delivered *before* the online map style finishes loading is kept pending and animated after the style becomes ready. A manual map gesture made during the location request prevents an unsolicited automatic recenter; the My browser location button may always be used explicitly.
- The local coordinate-grid / offline raster fallback now also moves and zooms gradually, with interruption on drag/wheel/zoom buttons. Motion-reduction preferences avoid animation.
- Offline-area tools remain available but optional, labeled as offline tile management and collapsed by default. No change to map downloads, USB/ESP32 receivers, investigations or SQLite storage. See [v0.2.13 test guide](docs/RELEASE_0.2.13_TESTS.md).

## v0.2.12 — Licensed raster tile ZIP → offline MBTiles

- **Survey Map → Manage offline map areas**: export a saved area as a **provider-neutral XYZ tile plan JSON** with geographic bounds and per-zoom x/y ranges. This is an acquisition *plan*, not map data, a download, an API endpoint for a provider, or a coverage guarantee.
- **Import local tile ZIP to MBTiles**: choose a ZIP containing tiles in `z/x/y.png` / `.jpg` / `.webp` paths (optionally inside `tiles/` or one root folder). Select an existing saved area, enter a new map name, original provider/source name and required attribution, pick the archive's XYZ or TMS row numbering, and confirm actual offline/archive rights. OpenRF validates and clips the ZIP to your area, converts selected tiles to standard TMS MBTiles, and installs it into private local storage. It cannot fetch or generate source map tiles; **provider permission is required**. Never use bulk raster requests to public OpenStreetMap tile servers for this.
- **Safety:** no overwriting existing packages; no extraction to filesystem paths; rejects traversal, symlinks, malicious path layouts, corrupt images, duplicates and mixed image formats; bounded 512 MiB input/output and 10,000 selected tiles. Source ZIP stays on the user's computer and is not changed. No migration to user investigation SQLite, new dependency, automatic upload, live RF scan, or radar implementation.
- See [Tile ZIP workflow](docs/TILE_ZIP_IMPORT.md), [Offline Maps](docs/OFFLINE_MAPS.md) and [release tests](docs/RELEASE_0.2.12_TESTS.md).

## v0.2.11 — Geographic area planner and local MBTiles subset builder

- **Survey Map → Manage offline map areas → Plan a geographic area**: choose two opposite corners directly on the map (online vector or offline raster grid), capture the visible map extent, or enter west/south/east/north coordinates manually. Plan zooms 0–18 and save named areas locally outside Git, separate from observations. During two-corner selection, map clicks do not add observations. Saved plans can be viewed, exported as GeoJSON or deleted without removing maps or investigations.
- **Create local MBTiles subset**: select a previously installed and licensed *raster* MBTiles map and a saved area. With explicit confirmation that the source license permits derivatives, create a new package containing **only existing local tiles** intersecting that area/zoom range. Includes source attribution; no automatic download, no remote tile requests, no overwritten source, no promise of complete geographic coverage. Bound to 10,000 candidate tiles and 512 MiB tile payload per subset; existing 1 GiB browser import limit unchanged. A plan works even without source tiles, but a basemap requires a source package.
- See [Offline Maps](docs/OFFLINE_MAPS.md) for privacy, Web Mercator, license, zoom/extent limitations. All existing v0.2.10 features and Android archive are preserved. No SQLite investigation database changes, extra Python packages, new ESP32 driver, radar detection, or external RF scanning.

## v0.2.10 — Offline map area manager

- **Survey Map → Manage offline map areas** can now import raster MBTiles from the browser, inspect the declared map boundaries, zoom range, size and provider attribution, center on the selected region, and explicitly remove that local map package. Streams up to 1 GiB to a private staging file without loading the entire archive into RAM. Rejects unsupported/corrupted files and duplicate names; no existing local map or observation database is overwritten. See [Offline Maps](docs/OFFLINE_MAPS.md).
- **No automatic tile-area downloads:** Public OpenStreetMap tile servers remain off-limits for offline prefetching; only previously licensed local MBTiles packages may be imported. Vector basemap remains online. Offline grid and observation pins work without internet.
- Hardware and sensor inventory now explicitly list the radar receiver module as **NOT IMPLEMENTED**, rather than silently implying generic RF hardware can detect it. Added a [long-range receive-only police radar module roadmap](docs/RADAR_RECEIVER_ROADMAP.md) for future X/K/Ka and LIDAR detection. **No radar hardware, radar detection, range, or laser sensor is implemented in this release.**
- Preserved previous map behavior, SQLite data, USB diagnostics, one-shot Wi-Fi, investigations, archived Android project, and ESP32 firmware. No schema migration or required new Python packages.

## v0.2.9 — Local raster basemaps, offline grid and optional cached MapLibre

- **Raster fallback no longer calls OpenStreetMap's public tile servers**, which reject some restricted requests and prohibit offline-area prefetching. If no local basemap is selected, the existing draggable Web Mercator grid, geolocation dot and recorded survey pins remain interactive without a network.
- Copy a licensed prebuilt **raster MBTiles** file (PNG/JPEG/WebP) to `~/.local/share/openrf/maps/` on Linux/WSL. Select it in the Survey Map **Offline basemap** dropdown and use **Refresh maps**. Tiles are read read-only from this separate local folder, with no request to an external server. No map downloads or tile uploads are implemented. See [Offline Mapping](docs/OFFLINE_MAPS.md).
- Optional one-time `python3 tools/cache-maplibre.py` copies MapLibre v5.24.0 JavaScript and CSS from the pinned upstream release to `~/.local/share/openrf/assets/`. When not cached, the server redirects those resources to the existing CDN for online vector-map mode; the grid/MBTiles renderer works independently of MapLibre. **OpenFreeMap vector tiles remain online**, even if JS/CSS assets are cached.
- Local map packages remain outside Git and the release ZIP, and are never published by the updater. No existing observation database schema changes, recording logic changes, or hardware firmware changes.

## v0.2.8 — Experimental ESP32-S3 USB sensor firmware

Includes source-only Arduino-ESP32 3.x firmware under `firmware/esp32-s3-openrf-serial-v1/` for an ESP32-S3 device **you flash separately**. A manually requested OpenRF Serial v1 snapshot runs a passive 2.4 GHz Wi-Fi AP scan and returns up to 32 observed AP identifiers, frequency MHz, and ESP32-reported RSSI dBm. The firmware offers WIFI only; it does not claim BLE, 5/6 GHz, SDR or GPS. No board, compiler toolchain or USB port was available here; firmware flashing and live measurements are **not physically verified**. See its README for build/USB instructions and limits.

Hardware inventory now displays Linux serial port access/group hints and error messaging for firmware errors, disconnections and permission failures. Port presence or a successful handshake remains **unverified**, never proof of an authentic or calibrated sensor. No background scans or external uploads. The SQLite schema is unchanged.

## v0.2.7 — USB serial interface and sensor snapshots

A new **External USB sensor** section on Hardware allows explicit probing of an inventoried Linux `/dev/ttyUSB*` or `/dev/ttyACM*` endpoint. It will only communicate with firmware implementing `openrf.serial.v1` (see `docs/USB_SERIAL_PROTOCOL.md`). A successful probe verifies only protocol response, not hardware identity or RF correctness. **Capture one snapshot** asks a compatible module for one bounded set of measurements and saves it with unverified device provenance. Experimental ESP32-S3 firmware is included in v0.2.8, but is not flashed automatically or physically tested. Missing WSL USB passthrough is an expected unsupported state. No background scanning occurs.

Previous saved Wi-Fi snapshot features remain described below.

## v0.2.6 — Saved surveys, measurement quality and readiness

- **Save scan snapshot:** After requesting a real one-shot Linux Wi-Fi scan, choose **Save scan snapshot** on the Survey Map or Analysis screen. This saves the verified server-returned results **as one atomic capture**, including a zero-result retrieval. Individual AP saves from v0.2.5 still work. Scanning is never automatic or continuous.
- **Optional survey coordinates:** Check **Attach observer position from scan time** before saving. The browser must already have returned a location fix **within 60 seconds before scan request**. If none was recent, save without coordinates or use **My location** and initiate a new scan. A coordinate is *where the browser reported the receiver*, never the AP/transmitter location, and is not independently verified as GNSS.
- **Capture history:** Investigations now list saved Wi-Fi snapshots and show how many observations were attached to each session. Snapshots include source adapter, UTC retrieval time, freshness warnings, quality units, observer coordinate origin, optional fix age, and returned/saved counts. No-result scans are listed as events, never as detected signals.
- **Signal analysis:** The chart can show repeated measured NetworkManager signal-quality percentages separately from manually entered **RSSI dBm**. These quantities are never merged or interpreted as distance. Cached AP results may still occur. CSV/GeoJSON include capture IDs, percent quality, and location provenance.
- **Diagnostics:** Hardware now shows a read-only readiness/last-retrieval report. Visible interfaces are not evidence of an attached working SDR/BLE/GNSS sensor.
- **Database migration:** Automatic additive SQLite schema upgrade preserves prior observations and sessions. Back up the private database if it contains valuable records. The release was tested on SQLite fixtures but not yet on your WSL data.

On the WSL machine with only `eth0`, **Save scan snapshot remains disabled until a real Linux-visible Wi-Fi interface returns an actual scan**. There are no fabricated test readings; the optional existing DEMO set remains separately marked.

## v0.2.5 — Touchscreen map controls and sensor connections

- On browser windows ≤900 CSS pixels wide, OpenRF opens directly to Survey Map, with a top-right hamburger-triggered vertical drawer from the right (Overview, Map, Analysis, Saved, Sessions, Hardware). 5-inch Raspberry Pi Touch Display 2 portrait 720×1280 and landscape 1280×720 orientations were tested in an emulated browser; no physical touchscreen or Pi OS test has occurred. Desktop layout remains unchanged. All pages remain reachable; technical signal analysis still has its own page.
- Tap the **layers icon in the bottom-right corner** on Survey Map to open a touchscreen-friendly panel. Toggle Wi-Fi, BLE, RF, cellular, infrastructure, and manual **saved survey observations**, view how many geotagged points are displayed, or request the same optional native Linux Wi-Fi one-shot scan that remains on the Analysis page. Demo records remain hidden by default.
- Markers are color-coded by recorded category. **Every marker represents where an observation was recorded, not an estimated transmitter location.** Manually entered categories remain explicitly `MANUAL` provenance. The live one-shot NetworkManager AP list has **no device coordinates**, so it remains a temporary list by default. A specific result may now be saved explicitly using a server-issued scan receipt. The user may optionally attach the browser's observer coordinates (not the AP's location).
- Browser location behavior (permission once, accuracy notice, marker, street-level zoom), vector/raster map fallback, observations, investigations, exports, database, and existing Linux hardware detection are preserved. There is no continuous BLE/Wi-Fi/SDR scan or live RF heatmap in this update.
- To preview the 5-inch layout before purchasing hardware, narrow Firefox to ≤900 CSS pixels wide or use responsive design mode. Map controls are inside the map sheet at handheld sizes.

**v0.2.5 controls:** On compact displays, the menu now sits in the top-right and the map Layers & Scan button is icon-only in the bottom-right. Browser location is applied after the map style becomes ready, preventing the zoom being lost at startup. Attribution has been reduced to a small `ⓘ` disclosure on the map with the required data credits.

**Sensor receipts:** The Hardware screen now lists adapter driver states, and NetworkManager scan results have individual **Save** buttons. Each save references an actual recently returned scan and preserves `SENSOR` provenance and retrieval timestamp. A scan may include cached entries, Wi-Fi quality percentage is not RSSI in dBm, and the user's browser location is optional and is not the access point's location. See [docs/SENSOR_CONNECTIONS.md](docs/SENSOR_CONNECTIONS.md). BLE/SDR/GNSS capture remains future work.

No special map API key is needed for the existing OpenFreeMap styles. Do not paste private keys into project source or public GitHub commits.

Hardware planning: see **[docs/HARDWARE_SHOPPING_LIST.md](docs/HARDWARE_SHOPPING_LIST.md)** for a staged parts list, estimated costs, and what not to buy yet.

## Working features

- **Dashboard:** Real counts from locally stored records and explicit environment status. No invented scan results.
- **Map:** Automatically requests browser geolocation on first visit (requires explicit permission), adds separate location marker and accuracy-aware street-level zoom; never saves browser position. MapLibre 5 with OpenFreeMap street/dark vector maps when the resources load, or an independent built-in raster map if they do not. The fallback shows a fully offline coordinate grid and can render a separately supplied raster MBTiles package; it no longer requests OpenStreetMap raster tile servers. Map clicks create manual observations at the survey coordinate.
- **Discoveries:** Save/delete manually entered signal or infrastructure observations, with coordinates, source label, timestamps, optional RSSI/frequency/identifier, and provenance. Coordinates always refer to survey location.
- **Investigations:** User-started local sessions; manually entered observations and explicitly saved Wi-Fi snapshots can be linked to an active session. Start/stop/review history; a prior ACTIVE session is marked INTERRUPTED after a process restart. No background capture or travel tracking.
- **Native Linux Wi-Fi survey:** On-demand `nmcli` access-point list if a Linux Wi-Fi interface is visible. No background scans; NetworkManager may use active probe frames and may return cached entries. SSID/BSSID, channel, frequency, security, and signal **quality %** are shown temporarily. Results are not GPS positions or RSSI dBm. Individual access points or an entire short-lived verified scan may be explicitly saved, with a UTC retrieval timestamp, source, and freshness caveat. Only captured one-shot snapshots preserve the separate quality-percent measurement column and group ID. See `docs/NATIVE_WIFI_DRIVER.md`. WSL with no Linux radio returns a clear unavailable error.
- **Signal analysis:** Inspect saved BLE/Wi-Fi/RF/cellular-labeled observations and plot either RSSI dBm or NetworkManager quality-percent history by recorded identifier (never mix units). Manually entered RSSI values remain labeled `MANUAL`; they are not a true measurement from a connected device.
- **Hardware:** Read-only visibility of real Linux USB descriptors, USB serial ports, network and Bluetooth interfaces, plus unconnected/planned sensor integrations (SDR, BLE, Wi-Fi, GNSS, CC1101 and external cellular modem). No driver availability is falsely inferred from an interface name.
- **Exports:** Local CSV and GeoJSON with source and observer-location semantics, including capture grouping and Wi-Fi quality-percent metadata. CSV escapes spreadsheet-formula injection. Nothing is uploaded automatically.
- **Optional demo data:** A user-triggered synthetic sample set marked DEMO everywhere, hidden from map/discoveries by default; remove via Dashboard.

## Test the app before buying hardware

1. Visit Overview; confirm all counts initially zero on a fresh WSL install.
2. Visit Survey Map. Online OpenFreeMap vector tiles provide street detail; if unavailable, use the built-in grid or select an installed local raster MBTiles package. Click a point or use **Add observation manually**; save a labeled note. Confirm map marker and Discoveries list. On first opening Map, the browser asks for location permission (if not previously granted/denied); with a usable fix it centers automatically. If location is blocked, unavailable, or coarse on desktop/VPN, you can still pan or use “My browser location”.
3. Start an Investigation; create another observation and confirm it appears in the session's Records view. Stop the session. Refresh the page and verify persistence.
4. Download CSV and GeoJSON; verify the saved note and the explicit `coordinate_meaning` field. Check the private database exists under `~/.local/share/openrf/openrf.sqlite3` on Linux. It is **not** inside the Git repository.
5. Check Hardware for `WSL 2 / Linux` and explicit unavailable/not-connected states. Do not expect Linux WSL to capture built-in Wi-Fi or Bluetooth devices.
6. Optional: Load synthetic demo data and check Signal History graph. Confirm demo is labeled and hidden by default on the map. Clear the demo before field use.
7. Shut down Ctrl+C and rerun; verify saved records survive. Active sessions should be marked INTERRUPTED, not silently resumed.

## Testing and privacy limits

- Backend uses Python standard library + SQLite only. GitHub Actions tests Python 3.11 and 3.14 and checks JavaScript syntax. It does **not** build an APK.
- The server binds only to 127.0.0.1 and validates request Host/Origin. It is not an authenticated multi-user server or a safe public internet service. Do not expose its port to untrusted networks.
- OpenFreeMap street vector tiles require internet. The built-in coordinate grid and any operator-installed licensed raster MBTiles package work without internet or third-party JavaScript. MapLibre JS/CSS may be cached separately. OpenRF does not itself download map areas. Data storage and API do not need network access.
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
- If browser extensions, VPN, or network policies block MapLibre, the raster fallback appears automatically; use **Offline / raster**/**Try online vector** to switch manually. Raster mode uses only a coordinate grid or locally installed MBTiles tiles; it never contacts OSM public raster tile servers.
- Opening Survey Map automatically requests browser location once; the button can retry manually. Neither stores GPS coordinates. WSL cannot supply actual GPS fixes without appropriate hardware.
- All page headers now top-align; the scanner's records panel has 20px separation from the two panels above it.
- Open **Hardware → Detected host devices** to inspect USB descriptors and Linux-visible interfaces. These read-only entries do not prove that a radio device is supported or operational. `Refresh inventory` doesn't run a wireless scan.
- Stop/restart the OpenRF Python server after installing new source; press `Ctrl+C` in Ubuntu and rerun `python3 -m openrf`. Refresh your Windows browser with `Ctrl+F5` to discard previous scripts.

## v0.2.5 validation walkthrough

1. Resize Firefox to ~720 px wide. OpenRF should open Map by default and show a hamburger in the top-left corner. Open it to see all six destinations in a vertical drawer; tap outside it or press Escape to dismiss. Confirm the page has no sideways scrolling. Map layers open from **Layers & Scan**. Desktop still opens Overview.
2. In the sheet, toggle Wi-Fi/BLE/etc. Existing geotagged saved observations should appear/disappear on both vector and raster maps without being deleted. Other records and DEMO controls remain separate.
3. Tap **Scan Linux Wi-Fi once** in the map panel. WSL with only `eth0` must report unavailable; this is not a Wi-Fi discovery failure and must never create map pins. On supported native Linux, NetworkManager results appear temporarily, not geolocated.
4. Use the sheet’s **My location** control. It should preserve the permission behavior that worked in v0.2.2; no coordinates are stored. Check switching map styles and vector/raster mode.
5. Test the Analysis, Saved, Sessions, Hardware and Overview pages. Ensure existing database records, exports and user-started investigations are still available.

## Historical v0.2.2 validation walkthrough

1. Survey Map should request browser geolocation once upon first opening. If allowed, it recenters (zoom 15 with a reasonably accurate fix). A blue location marker is **not** an observation or an RF transmitter. On Windows/VPN a browser fix might be approximate. No coordinates are saved or transmitted to the OpenRF backend by this step.
2. Toggle Raster fallback / Try vector map; center and zoom should persist. Both modes support the geolocation marker and manual observations.
3. Scanner → Scan Wi-Fi once: on your current WSL machine with only `eth0`, expect “No Linux Wi-Fi interface is visible”; do not expect fabricated nearby networks. If a native Linux Wi-Fi adapter + NetworkManager is available, it returns a temporary access-point list. This is a manually invoked scan, possibly active probing, not continuous capture.
4. Hardware → Confirm Wi-Fi readiness message matches the Linux interface inventory.
5. Check observations, investigations and exports from v0.2.1 survive; no database migration. Use `python3 -m unittest discover -s tests -v` and `node tests/test_frontend.js`.

The one-shot driver was tested with mocked NetworkManager responses, **not physical RF hardware**, and the site behavior was checked with a fixture browser location, **not an actual Windows location fix**.
