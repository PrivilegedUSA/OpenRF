# OpenRF v0.2.43 — Field Survey Planning & Evidence Dashboard

OpenRF is a local-first, open-source RF and geographic investigation platform intended for **WSL development now and a self-contained Raspberry Pi field instrument later**. The previous Android v0.1.6 source has been preserved under `legacy/android-v0.1.6/` but is no longer the primary application.

**No external RF sensor is required to run the interface.** Scanner signal history shows only manually saved records and explicitly labeled synthetic demonstrations. On a supported native Linux host, a separately requested NetworkManager Wi-Fi access-point list can display real but potentially cached results temporarily; this functionality has not been tested with physical RF hardware. Hardware inventory is real and read-only; detecting a Linux network adapter is not proof that a scanner driver is ready. GPS coordinates belong to the observer/survey position, not an inferred transmitter position.

## Install/update via the existing Windows updater

1. Download `OpenRF-v0.2.43.zip` into Windows Downloads.
2. In PowerShell (from any folder), run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

3. The local updater installs to `C:\projects\OpenRF`, creates a Git commit of managed paths, and pushes by default. Its output still says **"Android APK workflow"**, because that wording is hardcoded in the reserved updater. For v0.2.43 the actual trigger is `.github/workflows/openrf-linux.yml` instead. The old Android workflow is intentionally retired; **no Android APK is produced by this release**.
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

## v0.2.43 — Field-survey planning and evidence dashboard (NO AUTO SCANS)

- Under **Sessions → Start field survey**, name a private investigation and choose a *planned* receiver: Linux Wi-Fi, Bluetooth LE, USB serial, offline SDR CSV, manual, or none. Record a site label, objective and notes. These values **do not prove any device is connected, transmitting or capturing**. Editing the plan cannot overwrite recorded hardware identity, signal quality, frequency or timestamps.
- An active survey panel shows only real database totals: saved observations, non-DEMO observer-coordinate records, SENSOR entries, one-shot scan snapshots and user-created waypoints. Older session records are migrated additively, with their receiver marked **Unassigned** rather than guessed. Starting a session does not start scanning, automatic GPS logging, background jobs or uploads.
- **Open receiver workspace** links to Analysis, Hardware, Spectrum or the map as appropriate. Wi-Fi, BLE and USB scans still require user action and each Save operation is explicit; saved records link to an active investigation as in previous versions. **Offline SDR CSV files remain local, read-only analysis and do not become observations.** A browser location is an observer position, never a transmitter estimate.
- Printable/JSON investigation reports now include the survey plan and clearly say it is a user statement, not verified hardware evidence. Notes can contain sensitive information; review before sharing. Stored raw records and private local configuration are outside Git and release ZIPs.
- Tests: 167 Python tests, 22 JS suites in the software environment, fresh ZIP extraction/regression, additive SQLite migration, HTTP endpoint validation and browser UI structure. Actual RF hardware, field GNSS, Firefox layout and GitHub CI are **not verified**. See [release test guide](docs/RELEASE_0.2.43_TESTS.md).

## v0.2.42 — Offline SDR spectrum/waterfall foundation (NO LIVE RF CAPTURE)

- **Spectrum** is a new navigation page containing a responsive frequency-spectrum plot and chronological waterfall. It reads only a user-selected local `rtl_power` CSV; the file stays **inside the browser**, and the backend does not accept uploads or save those bins to SQLite. A slider lets you inspect historical frames. From/To MHz fields change the display only, not receiver tuning.
- **Load synthetic DEMO** exercises the display with artificial spectrum peaks. DEMO is conspicuously labeled, never a measured live signal or investigation observation, and Clear removes it from memory.
- Reported `rtl_power` bins are labeled **dB, not calibrated dBm**; the CSV timestamp's time zone is **unverified**. Invalid, overlarge, and malformed rows are rejected; frequency ranges and collection characteristics are never inferred from an absent receiver.
- New read-only `GET /api/sdr/status` reports offline-file support, optional installed `rtl_power`/`rtl_test` tools and an explicit future receiver-driver contract. Hardware and sensor registry show tooling as **unverified**, not a connected SDR; no subprocess captures or RF transmissions occur.
- Preserves Wi-Fi/BLE one-shot scans, GNSS/Valhalla/DEMO navigation, offline maps, saved investigations and Android archive without any database migration or extra dependency. See [v0.2.42 tests](docs/RELEASE_0.2.42_TESTS.md). Testing was software-only; no RTL-SDR/HackRF, genuine CSV data or Pi hardware was available to verify measurements.

## v0.2.41 — Multi-location saved wireless survey

- Tap a saved Wi-Fi/BLE/RF/cellular observer marker, and select **Compare saved readings at multiple locations** under a compatible signal-history series. The Layers inspector shows a chronological graph and time-stamped sample list; the map highlights only the receiver's saved sample positions. It never estimates a transmitter location or draws a travel track.
- Compatibility is strict: identifier, source device, hardware identity, source type, frequency, and measurement type/unit must match. A measurement is not "live" just because it is mapped.
- Review the recorded accuracy for each sample and the count of consecutive sample pairs whose *reported* accuracy circles don't overlap. Those are not proof of direction or separation.
- An explicit **Export sample CSV** action prompts before including exact survey coordinates. Nothing uploads automatically. Local rasters and MapLibre vectors both display the saved sample highlights.
- To collect new multi-location evidence: deliberately run a real one-shot Wi-Fi or BLE scan on a supported Linux receiver, explicitly save with a recent browser observer fix, move to a new location and repeat. No continuous collection, fake readings, background GPS history, or new database migration.
- See [v0.2.41 tests](docs/RELEASE_0.2.41_TESTS.md); no physical Wi-Fi/BLE scanner, real receiver travel or Firefox field test verified here.

## v0.2.40 — Wireless map inspection, separate signal units and historical context

- **Map → Layers:** select **Marker colors**: category, recorded RSSI (dBm), or Wi-Fi signal **quality (%)**. Metric displays are independent; a missing or inapplicable measurement is gray, never guessed. Category colors remain available. DEMO records are excluded unless the operator explicitly enables them (orange, distinctly historical). These markers show only **saved observer coordinates**; they are NOT estimated RF transmitter locations, coverage or a heatmap.
- Optional **Saved records** filters: all dates, last 24 h, last 7 days, last 30 days. Invalid/future timestamps cannot appear as recent data. Filtered records are hidden **only from the map**, not deleted from SQLite or source investigations.
- **Inspect a saved mapped point** by tapping its vector/raster marker or from **Saved wireless readings on this map**. The panel displays its actual time, source, device, recorded metrics, optional reported location accuracy, and historical readings from the **same identifier, hardware, frequency, source and unit**. History and earlier/later medians are explicitly descriptive, not transmitter distance or direction.
- The existing map sheet now shows both **temporary Wi-Fi and BLE** one-shot results. Explicit Scan BLE once requires Linux BlueZ and a visible compatible controller. Results are NOT automatically mapped, geolocated or saved; existing server-issued BLE receipts still guard a user-selected Save.
- Pure `openrf/static/survey_map.js` provides read-only filters and graphics contracts, served only on the local loopback API. No new Python dependencies, external network requests, database migrations or tracking. Existing Valhalla, offline Dark/Light maps, printable directions, GNSS beta, BLE/Wi-Fi drivers and Android archive remain intact.
- See [v0.2.40 tests](docs/RELEASE_0.2.40_TESTS.md). Real Linux Wi-Fi/BLE hardware scans and actual Firefox/Raspberry Pi map interactions are **not verified** in the build environment.

## v0.2.39 — Read-only Linux Bluetooth LE discovery (user-started)

- **NEW in Analysis:** Press **Scan nearby LE devices once** to request a bounded 8-second `bluetoothctl --timeout 8 scan le` on a Linux-visible Bluetooth controller and responsive BlueZ daemon. OpenRF never pairs, connects, advertises, or runs scans in the background. WSL without USB controller passthrough displays **unavailable**, not a made-up empty scan.
- Shows BlueZ LE device-event names, Bluetooth addresses (which **may rotate/randomize**), and **RSSI dBm only when BlueZ supplies it**. The retrieval timestamp is not proof of exact advertisement time, and cached BlueZ properties are possible. No frequency, device position, stable person identity or distance is inferred.
- Results are ephemeral until explicitly selected. **Save** accepts only a short-lived server scan receipt and an address that BlueZ actually reported, then stores a SENSOR/BLE observation with source controller, reported RSSI if any and optional *observer* location at the time of scan. No automatic map pins, history, or observations. A saved observation is visible in Saved and appears on the map **only** with an explicitly attached observer coordinate.
- The Hardware sensor registry distinguishes **ready on demand** when a Linux controller/BlueZ is visible from **unavailable**, and continues to label actual scanning as user-triggered only. There is no claim that ordinary Windows Bluetooth is exposed through WSL or that scans were physically verified here.
- Retains Wi-Fi one-shot scans, custom MapLibre Dark/Light maps, Valhalla, offline directions, navigation DEMO, manual survey, reports, and Android archive. No required Python libraries, private data migrations or credentials.
- See [v0.2.39 test plan](docs/RELEASE_0.2.39_TESTS.md).

## v0.2.38 — Wireless discovery foundation and settings gear fix

- Map settings gear remains a small control at **bottom-right** next to Add and Layers even while open; close popup with a separate **X** or Escape. The bottom-left map attribution info remains unchanged.
- One-shot NetworkManager Wi-Fi scan displays the reported BSSID, frequency, band, channel, security, mode, advertised AP rate and signal **quality %**, with band and SSID/BSSID filters. It does not invent RF hardware, RSSI/dBm, accurate AP distance or transmitter locations. Requires a compatible Linux-visible Wi-Fi adapter and nmcli. Survey saving still requires the actual server scan receipt.
- Linux Bluetooth readiness checks hci controller visibility and BlueZ responsiveness. **No BLE device scan** or nearby-device tracking is implemented yet.
- Fix serial HTTP probe/snapshot lock ordering that can cause an intermittent CI failure. This is a code-level fix, not confirmation of a successful GitHub run.
- All existing custom Dark/Light maps, Valhalla routing, offline road/tile resources, navigation DEMO, observation records and Android archive remain in the source. No SQLite migration. See [v0.2.38 test plan](docs/RELEASE_0.2.38_TESTS.md).

## v0.2.37 — Real code: planned directions headline and opt-in DEMO route drive

- **Main turn banner**: even with coarse desktop location, OpenRF now displays the first planned Valhalla instruction as the headline, with the **Planned** label and the approximate-location warning underneath. Live timing is still withheld until suitable real moving GNSS is available; route plans and printable sheets work without GPS.
- **Test on your computer:** Get directions for a destination within the local Valhalla road graph, press Start navigation, expand **Test route (DEMO · no GPS)**, then Play DEMO. Pause/Resume/Stop and 1×/5×/20× playback let you watch a distinctly orange **DEMO** vehicle follow the actual calculated road line while the upcoming maneuver changes. The browser GPS dot is hidden only while DEMO is active. This is **not live navigation**.
- The DEMO movement speed is a fixed virtual 35 mph × the selected multiplier, regardless of real speed limits. Its map pitch, look-ahead position, and bearing are simulated from road geometry, not a measured vehicle heading. No demo points are saved or sent to server APIs. Playing DEMO stops browser GPS acquisition and local GNSS polling until navigation is deliberately restarted.
- Real browser GPS is still limited by its reported precision (~±100 m on the current WSL desktop). Automatic rerouting, real spoken turns, traffic and reliable in-vehicle maneuver timing are not implemented. **Do not use this release as live driving guidance.** See [v0.2.37 testing](docs/RELEASE_0.2.37_TESTS.md).
- No migration, hardware claim, new Python dependency or changes to the installed Northern California Valhalla data. The map, RF tools, reports, exports and archived Android source are preserved.

## v0.2.36 — Route-oriented follow view on desktop without false GPS heading

- **Fixes desktop follow-camera behavior:** Starting navigation immediately enters a tilted, route-perspective view at the real Valhalla road plan's start, clearly labelled as a *planned route perspective*, not the device's location. With a recent browser position near the route (even ±107 m), it shifts the camera to that **reported position** and orients the camera along the *planned road*, while explicitly saying that this does **not** establish actual vehicle heading or precise turn timing.
- With verified **accurate, moving** GPS with real heading, the camera uses measured heading instead, tilts/zooms and displays upcoming maneuver distance. An approximate fix always shows **planned (not current)** turns rather than live turn timing; no fake movement or GPS readings are produced.
- Manual dragging suspends automatic camera updates to avoid Rural Route-style snapback; tapping the map's crosshair resumes camera following. Stale fixes, far-away routes and missing GPS remain accurately labelled; nothing is saved or uploaded.
- In raster fallback mode the map can recenter but cannot rotate or pitch; MapLibre is required for the route-oriented camera. The user must have a real confirmed Valhalla ROAD_ROUTE before entering navigation. No voice guidance/automatic rerouting yet. Real Firefox and GNSS road tests are pending.
- No new Python dependencies, database migration, map tiles, credentials, or sensors. See [v0.2.36 testing](docs/RELEASE_0.2.36_TESTS.md).

## v0.2.35 — Planned turns, GPS follow and optional local gpsd bridge

- Start navigation shows the **next planned turn** even when the browser provides a coarse/stale position, clearly marked **planned (not current)**. The expandable numbered turn list is accessible within the driving view. Only fresh and sufficiently accurate positions advance live turn timing.
- Optional **local read-only gpsd** bridge for Linux/Raspberry Pi (`127.0.0.1:2947`, `?WATCH`/`?POLL`). It is queried only during explicitly started navigation, stops when the user stops or leaves the Map, does not persist location records, and reports device, UTC timestamp, fix age, horizontal accuracy estimate, course and speed if available. Missing/stale/unknown accuracy is not treated as a valid fix. The browser remains the fallback.
- With a real, accurate, **moving** position and heading, the map keeps the driver below center in a tilted heading-up view; approximate desktop browser positions still use a broad north-up view. GPS follow remains a **beta**, not verified vehicle navigation; no spoken turn alerts, automatic reroute or road-level guarantees.
- Existing Valhalla routing, printable route sheet, offline vector maps, RF investigations and saved observations remain intact; no new dependencies or database migration. See [v0.2.35 tests and optional gpsd setup](docs/RELEASE_0.2.35_TESTS.md).

## v0.2.34 — Map overlay, drivable directions, and opt-in GPS-follow beta

- The destination search form now **overlays the Survey Map** instead of pushing it downward. **Get directions** calculates a planned road route first. Only a confirmed local Valhalla **ROAD_ROUTE** enables **Start navigation**.
- **Start navigation** asks the browser for continuous high-accuracy positions *only after the user presses it*. It offers a follow-camera (zoom ~16.5, pitch 42°, device heading when movement is reported) and a prominent next planned Valhalla maneuver. The browser coordinates are held only in temporary process/browser memory; **no GPS trail is saved or uploaded**. Stop ends the browser geolocation watch; leaving the Map page also ends it. Poor or stale fixes pause maneuver guidance. This is **experimental GPS-follow assistance, not tested active turn-by-turn navigation**: no voice, lane guidance, reliable positioning, traffic, road-closure updates, or automatic rerouting. Do not adjust the screen while driving.
- A **small solid red destination pin** remains movable on the map. It can also be dragged after picking a complete street address or generating a road route. Moving it discards the old route; press **Get directions** again before following the new endpoint.
- When local Valhalla cannot calculate a route to a very distant location (e.g. Alabama from Northern California), OpenRF reports missing road routing coverage and **does not draw a misleading interstate direct line**. Valhalla's regional `.osm.pbf` road graph is entirely separate from the online/offline visual MBTiles. The existing `setup-valhalla-wsl.sh` installs **Northern California only**. Nationwide routing requires expanded, validated road data and appropriate Docker resources, **not just a change of basemap**.
- Runtime OpenRF Dark and Light styles add zoomed-out **country labels** from the online OpenMapTiles `place` source when provided. The approved JSON files remain unchanged; the offline Amador/Calaveras tile package does not cover the whole U.S. and cannot guarantee country labels at continental zoom.
- MapTiler/Photon/Census geocoding and opt-in privacy remain unchanged. **True live early address autocomplete** still needs a working configured provider and network; regional offline street-name hints do **not** verify house numbers.
- Maps, SQLite records, surveys, wireless discovery, GPS waypoint capture, investigations, reports, archived Android code, and local Valhalla installations are preserved. No SQLite schema migration or additional Python dependencies.
- See `docs/RELEASE_0.2.34_TESTS.md` for WSL testing, privacy and hardware limitations.

## v0.2.31 — Approved OpenRF Maps integration

- Integrated **OpenRF Maps v0.1.11** into the existing Linux application (no replacement or duplicate map UI). **OpenRF Dark is the default**, and **OpenRF Light** is available in Map settings; both original approved JSON files remain byte-for-byte intact, and their empty standalone preview overlays are removed only from a served copy.
- The main Python HTTP server now serves the **bundled Amador/Calaveras vector MBTiles** (5,703 map tiles), offline Noto Sans glyphs, and the local MapLibre runtime. No second preview server or new account is required. Bundled regional tiles occupy ~25 MiB uncompressed; only the local map itself is distributed, not the full Northern California Valhalla source or private data.
- Under **Map settings**, choose **Use offline regional vectors** to switch from OpenRF's online vector source to local tiles without resetting surveys, pins, routes or the browser location. Offline map data is available only in the declared region; **outside this area, local tiles are missing**. The older raster package/coordinate fallback remains intact and separate.
- One-tap **Choose destination on map** still restores ordinary map panning after placement. You can now **drag the teal destination pin** to adjust the destination before starting navigation; the address/coordinates update and any stale route preview is invalidated. Dragging never records a survey observation or background GPS track.
- Added opt-in-free, **offline regional OSM street-name completions** once a house number and at least two street-name letters are typed (for example, `25005 State`). They fill only a possible **road name**, not an address match; **the house number is NOT verified**. Complete address matching via Census (approximate, after online opt-in), configured MapTiler/local Photon typeahead, and local Valhalla road routing remain unchanged. No invented address coordinates or invented driving routes.
- Map credits remain accessible. Data: © OpenStreetMap contributors (ODbL), Geofabrik-derived regional source, OpenMapTiles-style output; MapLibre and glyph notices are recorded under `docs/OPENRF_MAP_STYLE_NOTICES.md`. Select a compatible open-source license before any public distribution.
- See `docs/RELEASE_0.2.31_TESTS.md` for WSL checks, test coverage, limits, and instructions for installing an updated regional vector archive in private local storage.

## v0.2.28 — U.S. destination matching and local Valhalla setup

- **Start navigation** now takes its own full-width row below the opt-in search checkbox.
- Photon and MapTiler address queries are limited to the United States. Photon street-address results include the house number, street, city and state where supplied. Choose a specific suggestion before routing; OpenRF does not silently accept a guessed first match.
- Added a read-only local Valhalla status check on Plan a trip and an optional guided WSL/Docker helper under `tools/setup-valhalla-wsl.sh`. Valhalla itself and Northern California road data are **not** bundled, and setup has **not** been run for you. See [Local Valhalla setup](docs/LOCAL_VALHALLA_WSL.md).
- Public Photon remains an opt-in, best-effort demonstration service, not guaranteed U.S. street-address coverage. No automatic lookups or tracking.
- Existing reports, maps, sensor and investigation data are preserved. No database migration is required.

## v0.2.26 — Address lookup and navigation entry cleanup

- The map starts in the **legible Liberty style** again; dark map remains optional under Map settings.
- The destination input uses the full available width. A single **Start navigation** button with a diagonal paper-plane icon replaces the old Route button. It currently initiates route **planning**; turn-by-turn guidance is not implemented.
- **Online address suggestions** are optional, off by default, and use public Photon only after the operator opts in. Typed addresses are sent to the address provider over HTTPS; the browser's coordinates are **not** sent to the geocoder. The public Photon demo is fair-use limited and might be unavailable. Self-hosted Photon or explicitly configured MapTiler remain supported.
- A one-shot browser location request supplies a fresh starting point when the previous fix is stale, with visible errors if permissions are denied.
- With Valhalla and a regional road graph running locally, OpenRF can draw the returned road geometry and show planned maneuvers. Without it, **only a labeled dashed straight-line reference** is drawn—not a drivable route.
- Future options such as avoid highways, known ALPR cameras, road incidents and police reports are **planned, not implemented**. See [v0.2.26 installation and tests](docs/RELEASE_0.2.26_TESTS.md).

## v0.2.25 — Valhalla road-route adapter and address suggestions

- Added a local Valhalla interface, advanced multi-stop planning, geocoding support when configured, and the experimental dark map style. These capabilities remain present; v0.2.26 restores the Liberty default and adds optional public address suggestions.
- Detailed setup instructions are retained at [v0.2.25 tests](docs/RELEASE_0.2.25_TESTS.md).

## v0.2.24 — Map-first navigation and Rural Route research

- **Map is the primary workspace:** compact destination entry appears directly above the map, with an optional expandable **Plan a trip** workspace beneath it. There is no separate primary Navigation page. Stored destinations or `latitude, longitude` may be entered in the quick bar, with suggestions from private saved locations.
- The starting point defaults to your latest browser-reported location (when available and no custom origin has been entered). The map never starts background GPS tracking or saves navigation fixes. A custom origin is available in the expanded planner. Denied, stale, or unsupported location fixes fail clearly rather than guessing.
- **No address geocoding or road routing yet:** arbitrary street addresses are *not* resolved; an explicit message explains the limitation. Previews are still labeled **direct line, not a drivable route**. Full multi-stop navigation, roads and directions depend on the later routing engine and road graph.
- **Recenter button:** compact location crosshair below the map’s zoom and compass controls. A recent browser fix recenters immediately; otherwise it requests a new permitted fix without background tracking or saving.
- **Clean map opening:** optional offline basemap and map-file controls now sit below the main map and GPS survey waypoints. The small Survey Map layout opens without those panels pushing the map down the screen. Map controls remain available under **Map settings** and Layers. Required map attribution remains accessible.
- **Observation form:** Use my location now sits after the accuracy field, keeping coordinate and accuracy controls together. Existing secure location provenance remains unchanged.
- **Routing architecture:** reviewed the prior Rural Route history (MapLibre, previous HERE/Google Directions and later TomTom integration). Plan a local Linux-native Valhalla adapter using OSM-derived regional road graphs, with origin/destination and maneuver data normalized through OpenRF's JSON API; no live routing engine was bundled or configured in v0.2.24. See [routing design notes](docs/ROUTING_ENGINE_DECISION.md) and [release checks](docs/RELEASE_0.2.24_TESTS.md).
- No schema migration, new Python dependencies, traffic API keys, third-party location requests, RF hardware data, or changes to the local sensor system.

## v0.2.23 — Navigation foundation and compact map UI

- **Navigation (new page):** manually enter a starting coordinate and a destination; request a fresh browser location only by clicking the button; or choose the destination by tapping the Survey Map. No automatic location tracking or GPS recording.
- **Local saved destinations:** up to 250 named coordinates retained in a new additive `navigation_destinations` SQLite table, independent from observations, waypoint tracks, signal evidence and investigation records. Save, reuse or remove them through the navigation interface.
- **Geographic preview:** a dashed straight-line overlay connects the selected positions; the app shows great-circle distance in miles/kilometers and initial bearing. **This is NOT road routing, driving distance, turn-by-turn directions, police identification, or camera-aware route planning.** Do not use the line for driving instructions. Real routing, voice guidance, source-verified ALPR alerts, and radar integration remain future milestones.
- **Map cleanup:** removed the redundant full-width **Add observation manually** button under Map. Retained the + map action and map-click observation placement, now with smaller 32px borderless stacked-layers and + controls. **Map copyright attribution remains accessible** through a more discreet credit disclosure (can't remove required credits).
- Moved **Use my location** to immediately beneath the longitude field in the observation form. Existing browser-provenance and accuracy logic are unchanged. No third-party routing service, paid account, or new Python dependency.
- New API: `GET/POST /api/navigation/destinations` and `DELETE /api/navigation/destinations/{id}`, loopback-only with existing origin protection; input ranges and fields are validated. See [v0.2.23 test guide](docs/RELEASE_0.2.23_TESTS.md).

## v0.2.22 — Observation location shortcut and reliable startup

- **Bug fix:** The initial browser refresh requested a hardware-readiness result but failed to assign the returned value. Fixed the client-side `Readiness is not defined` error; the banner no longer incorrectly identifies all refresh errors as a local-server disconnection. The Hardware readiness checklist remains read-only.
- **Use my location:** Open Map → + (or Saved → Add observation) and press **Use my location** beneath the latitude/longitude fields. The browser requests a fresh location only at that moment and fills the coordinates and reported accuracy. Nothing is saved until you press **Save locally**. When geolocation is denied or unavailable, use manual coordinates or tap a map point.
- Location data is labeled **BROWSER_REPORTED**, and optional fix age is recorded using existing storage columns. Desktop/VPN location may be inaccurate; a browser position is an **observer location**, not proof of a camera, transmitter or police vehicle location. Manually edited coordinates are not mislabeled as GPS. Stale fixes must be refreshed before saving.
- No new Python dependencies, background location tracking, RF capabilities or database migration. See [v0.2.22 test guide](docs/RELEASE_0.2.22_TESTS.md).

## v0.2.21 — Hardware readiness and map actions

- **Hardware → Readiness checklist** evaluates the actual Linux inventory and previously requested Wi-Fi/USB activity, without initiating a scan, serial read, or device probe. It differentiates visible/accessible USB ports, permission failures, missing wireless interfaces, recent protocol replies, stale replies, and disconnected devices. All detected capabilities are **unverified until explicitly tested**. BLE, SDR, external GNSS and police radar remain **not implemented**.
- **Refresh hardware** now refreshes diagnostics and the readiness checklist as well as the inventory. **Export readiness JSON** downloads only the conservative status/checklist and aggregate counts, excluding private serial IDs, Wi-Fi addresses, raw readings and GPS records. It is not proof that a receiver is working.
- The Survey Map's **Layers** control is smaller, uses a familiar stacked-layers SVG, and remains at lower right. The adjacent **+** control opens the existing manual observation form **without silently assigning GPS or map-center coordinates**. Tap the map at a specific location to prefill coordinates instead.
- Added spacing below **Add observation manually** to separate it from the optional GPS waypoint card on narrow screens. No changes to stored observations, waypoints, captures, maps or the offline SQLite schema. No hardware driver dependency added. See [v0.2.21 tests](docs/RELEASE_0.2.21_TESTS.md).

## v0.2.20 — Manual, session-linked browser GPS waypoints

Go to **Map → GPS-linked survey waypoints** and start an investigation on **Sessions** first. Select the investigation, optionally enter a waypoint note, and click **Save a fresh location waypoint**. The browser asks for current geolocation only upon each explicit click. No background tracking, path reconstruction or RF acquisition occurs. A successfully saved waypoint is linked to that investigation and retains browser accuracy, fix timestamp and age, plus the server's receipt time. No satellite fix or external GNSS hardware is claimed.

**Show saved waypoints on map** is OFF by default, and only affects the selected investigation. Point markers work with the online vector map or offline coordinate/raster fallback. Separate points do not imply a driven route or transmitter location. **Export session GeoJSON** confirms before downloading precise location records; consider privacy before sharing the downloaded file. You can delete a single waypoint with confirmation without deleting investigation observations or scan captures. Waypoint export requires local API access and does not upload anything to third parties.

The additive `survey_waypoints` SQLite table is initialized automatically without overwriting existing data. The previous investigation HTML/JSON report does not yet include waypoints. See [v0.2.20 test guide](docs/RELEASE_0.2.20_TESTS.md).

## v0.2.19 — Advanced historical signal analysis

- In **Analysis → Signal history**, choose a compatible saved measurement series by identifier, kind, measurement unit, evidence source, receiver label, reported hardware identity, and recorded frequency. Unlike the previous identifier-only chart, different devices, units or frequencies never share an axis or a line. Both the graph and comparison panel now use the same grouping rules.
- Inspect **all / last 24 hours / last 7 days / last 30 days** of *saved* readings, relative to the newest reading in that series. A time-scaled chart displays values plus a median guideline; a summary lists count/median/min/max and timestamp span. A collapsible recent-readings list shows time basis and investigation assignment.
- Charts render a maximum of ~202 sample points using a min/max sampling algorithm, preserving spikes and dips in the plotted sample. All matching rows are still included in descriptive statistics and export. No chart reveals distance or source location, and saved measurements are never live scans.
- **Export selected series CSV** downloads only selected saved readings, with reported unit, provenance and receiver/time identity. **Precise observer GPS fields are omitted by default**; use the opt-in checkbox if necessary. Synthetic DEMO data is excluded unless independently enabled in the history panel. No remote requests are made for analysis/export and no database changes are needed.
- Browser/history comparisons are still limited to the latest 10,000 observations loaded by the local API; some older measurements could therefore be absent from the view. Unverified hardware, cached Wi-Fi readings and old/estimated timestamps retain caution labels. See [v0.2.20 tests](docs/RELEASE_0.2.20_TESTS.md).

## v0.2.18 — Printable investigation reports

- On **Sessions → Investigation report**, choose a saved investigation (or use its **Report** button). Preview a self-contained, print-friendly HTML report in a new tab, use the browser Print menu to **Save as PDF**, or download standalone **HTML** and **JSON** copies. The report is generated on demand from local SQLite records rather than potentially truncated browser lists.
- Each report includes session start/end/status, historical observations with evidence provenance and notes, explicitly saved one-shot survey captures including zero-result scans, source/category counts, and median/range summaries of compatible signal readings. The summaries only group identical kind, evidence source, identifier, receiver label, hardware ID, MHz and measurement unit; dBm is not compared with NetworkManager quality %.
- **Privacy by default:** synthetic DEMO observations and precise survey latitude/longitude are excluded unless their respective checkboxes are enabled. Coordinates describe **observer** survey positions, never RF source positions. Notes and identifiers can still contain personal information and should be reviewed before sharing.
- Reports are explicitly **HISTORICAL / NOT LIVE**. Source device identity, measurement accuracy, timestamps, calibration and scan freshness may be unverified. Empty investigations produce truthful empty reports. Large reports are capped at 5,000 observation records, 1,000 captures, and 150 metric groups, with visible truncation notices and original matching record counts.
- New read-only endpoints: `/api/reports/sessions/<id>.html` and `/api/reports/sessions/<id>.json`. HTML is self-contained without external assets; no report records are saved back to SQLite. No new libraries, auto uploads, live hardware scan, routing, radar reception or database migration. See [v0.2.18 tests](docs/RELEASE_0.2.18_TESTS.md).

## v0.2.17 — Historical signal comparisons

- On **Analysis → Compare saved signal history**, inspect historical measurements grouped by category, identifier, metric/unit, source, receiver label, reported hardware ID and recorded frequency. This prevents accidental comparisons of RSSI dBm against NetworkManager quality %, or results from different receivers/observations with the same identifier.
- **Earlier half vs later half** compares time-ordered saved readings. **Two investigation sessions** instead compares two explicitly selected sessions when both contain comparable samples. The panel shows medians, ranges, sample counts, timestamp spans, median difference and limitations.
- **Export comparison CSV** downloads the original baseline and follow-up records with measurement units, device/source provenance, GPS observer coordinates (if present), session IDs and timestamp basis. It is generated locally and does not modify the database. Spreadsheet-style formula injection is escaped.
- DEMO data is excluded unless enabled via **Include SYNTHETIC DEMO / HISTORICAL readings**; manual readings retain their unverified status. The browser's saved-record endpoint is limited to the latest 10,000 observations, and incomplete or unmatched groups cannot produce a comparison.
- No new RF hardware capability, live RF classification, location estimate, network transfer, database migration, third-party dependency, routing or radar detection. See [v0.2.17 testing](docs/RELEASE_0.2.17_TESTS.md).

## v0.2.16 — Saved Observations Explorer

- On **Saved / Discoveries**, filter existing local observations by text, type, evidence source, investigation session, recorded age (past day/week/month), or presence of survey coordinates. Sort by observation timestamp in either direction; use **Clear filters** without reloading the app.
- **Investigations → Records** now opens Saved with a visible, editable investigation filter instead of a hidden session-only mode that required a browser refresh to clear.
- **Export shown CSV** downloads only matching saved observations using the browser; it includes original `source`, `source_device`, timestamps, measurement units, survey coordinates/accuracy, session/capture references and hardware provenance where available. It does not change the existing full-export endpoints or upload anything. Spreadsheet-style formula strings in user text are escaped.
- DEMO data remains opt-in; imported, manually entered and sensor-reported records are not reclassified as live. Time-window filters use the browser clock and `observed_at` timestamps, not device-sensor clock inference. Stored record lists are currently capped to the latest 10,000 rows by the existing backend, and the explorer reports this limit.
- No database migrations, new Python dependencies, collection in the background, or change to radar/navigation feature status. Existing map UX and optional offline files are preserved. See [v0.2.16 testing](docs/RELEASE_0.2.16_TESTS.md).

## v0.2.15 — Fuller U.S. overview and smooth GPS camera

- Opening the Survey Map still starts on a U.S. overview when there is no previously chosen map view. After browser location permission is accepted and a fix is obtained, MapLibre smoothly pans and zooms to the browser-reported position with a bounded flight instead of snapping instantly.
- A fix delivered *before* the online map style finishes loading is kept pending and animated after the style becomes ready. A manual map gesture made during the location request prevents an unsolicited automatic recenter; the My browser location button may always be used explicitly.
- The local coordinate-grid / offline raster fallback now also moves and zooms gradually, with interruption on drag/wheel/zoom buttons. Motion-reduction preferences avoid animation.
- Offline-area tools remain available but optional, labeled as offline tile management and collapsed by default. No change to map downloads, USB/ESP32 receivers, investigations or SQLite storage. See [v0.2.15 test guide](docs/RELEASE_0.2.15_TESTS.md).

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

## v0.2.28 — robust full-street address lookup

- Route submission of a complete U.S. street address (e.g. `100 Main St, Jackson, CA`) can use the U.S. Census Bureau one-line geocoder after **explicit online lookup opt-in**. It returns a street-range approximation, not a verified entrance. Confirm the pin on the map before relying on it.
- Live typing suggestions still use Photon/MapTiler; public Photon is a demonstration endpoint and may reject or time out. Census is **not** a live autocomplete service, and city-only searches need Photon, saved places or the map picker.
- Choose destination on map is now directly beside destination entry and works without internet address lookup.
- On submit, inspect and select the returned address; do not silently route to a fuzzy or interpolated result.
- Real road routes still depend on local Valhalla. If it is not reachable, lines are labeled direct references and **never** imply turn-by-turn navigation.


## v0.2.30 — configure reliable U.S. address autocomplete

Public Photon is a **demo service**, not a guaranteed address autocomplete backend. For more dependable U.S. suggestions, OpenRF now accepts an optional **MapTiler Geocoding API key** from its map UI:

1. Create or use a MapTiler account/API key at https://cloud.maptiler.com/ (plan usage and key restrictions apply). A map tile URL or unrelated OpenMap/OpenFreeMap key is **not** a MapTiler geocoding API key.
2. On the Survey Map, expand **Address search setup** and paste the key into **MapTiler API key**. Click **Save key locally**. Do not post or commit the key. It is stored at `~/.config/openrf/geocoding.json` in Ubuntu with owner-only file permissions; it is outside the source ZIP, updater-managed paths, and Git. You can remove it using the UI.
3. Check **Online U.S. address search**, then open the panel and click **Test suggestions**. This tests a fixed sample city name; it sends no GPS. If the test reports HTTP 403, check the key, its permitted geocoding service and key restrictions. If DNS/TLS/proxy errors appear, check Ubuntu connectivity.
4. Type part of a U.S. address and **select the intended suggestion**. Press **Start navigation**. Unresolved address text is never silently routed to the first fuzzy result. If local Valhalla is ready and has road coverage, the result follows actual roads. If Valhalla is unavailable, only an explicitly labeled straight line appears.

The online opt-in is **off on each fresh page load**, including when a private provider is configured. Local Photon remains supported if separately installed. Without a key, public Photon may be throttled or unavailable; complete U.S. street addresses can still use the opt-in Census lookup when its service responds. Neither option guarantees street-by-street autocomplete. No address-search request automatically includes browser GPS, and no navigation request stores travel history. No geocoding service is bundled or required for manual survey features.

Local Valhalla health (separate from address search): `bash tools/setup-valhalla-wsl.sh --status`. You can always choose the destination directly on the map to test routing without geocoding. This release does **not** implement continuous driving navigation, GPS-following or audible turn instructions.

The Map destination picker also uses **tap once to select** with a crosshair cursor and a temporary yellow destination marker; it is not a draggable GPS pin. Press Escape or choose the picker again to cancel. No observation is recorded.
