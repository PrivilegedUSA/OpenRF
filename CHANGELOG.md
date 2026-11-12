## v0.2.33 — 2026-11-12

- Implement a separate gear-operated search-settings panel near bottom-left of the Survey Map, leaving destination, map picker, Get directions and Start navigation as the compact map overlay. MapTiler keys remain in the same private Ubuntu file; no duplicate search controls or offline tile changes.
- Enable online address suggestions by default as requested; preserve a local browser preference to switch them off. Sending typed queries remains limited to that action, with no GPS sent to third-party geocoders. The public Photon service still offers no availability guarantee; dedicated MapTiler remains recommended for early autocomplete.
- Replace the large GPS beta panel with a small status banner and expandable accuracy diagnostics. Distinguish geolocation permission from precise GPS fixes. Approximate fixes (such as ±107 m on desktop WSL) can center a broad north-up map, but cannot advance planned turn instructions. Stale or invalid fixes are clearly reported; no positions are written to the database. Guidance is still beta, without voice or automatic reroute.
- Preserve Valhalla routing, custom offline vector styles, markers and survey tools. Unit and frontend checks added; no live GNSS hardware or Firefox test performed here.

## v0.2.32 — 2026-11-12

- Move the original navigation form into a compact *overlay* on the main Survey Map. Keep MapLibre, Layers, Add Observation, GPS recenter, offline/online vector sources, and attribution intact. Fold optional address provider controls into a disclosure.
- Split the button flow: **Get directions** calculates a planned Valhalla route and maneuver list; **Start navigation** is disabled until a real local ROAD_ROUTE is returned. Explicit, opt-in GPS-follow beta draws the live reported location and a tilted/heading-up map camera with a next planned maneuver, applying fix-age, accuracy and off-route safety guards. Stop and page leave call clearWatch. No data is persisted, no audible guidance, no traffic, and no rerouting.
- Replace the dashed-yellow destination icon with a solid red, draggable endpoint on both new map picks **and** completed road/address routes. Moving it invalidates previous geometry and requires fresh routing.
- Suppress misleading long-distance direct-line displays when local Valhalla cannot route beyond Northern California. Explain offline vector tiles vs road graph coverage and the need for broader U.S. road datasets to plan cross-country journeys.
- Add online country-level MapLibre labels at continental zoom to the *served runtime style* without modifying the approved v0.1.11 style resource files. Regional offline map coverage remains limited.
- Extend routing results with maneuver geometry indexes. Add tests for linked leg indexes, runtime map label styles, opt-in GPS-follow safety behavior, and UI layout; run entire suite. No RF hardware or actual driving run was tested.

## v0.2.31 — 2026-11-12

- Integrate approved standalone OpenRF Maps v0.1.11 **Dark/Light** vector styles, byte-preserved sources, local 5,703-tile Amador/Calaveras MBTiles, Noto Sans glyphs and MapLibre runtime directly in the loopback Linux app; preserve observation, GPS, wireless, route and legacy Android modules.
- Add local-only vector status, style, TMS/XYZ vector tile and font endpoints, schema validation, proper gzip/content-type, network-free regional mode and retained map attributions. No second map server required.
- Enable drag-to-reposition destination marker with map panning intact outside the pin. The selected point is not a recorded observation; reroute only when user presses Start navigation.
- Add regional offline road-name typeahead hints for partial house-number/street inputs; **these are not geocoded addresses** and cannot validate street numbers. Existing optional MapTiler/Photon/Census providers and Valhalla remain unchanged.
- Add offline map, HTTP, isolation and drag tests. Chromium local HTTP is blocked here: browser GPS, final label rendering, actual touchscreen drag and network switching remain field-test items. No DB schema change or live RF measurements.

## v0.2.30 — Automatic Census address matches, Firefox search cleanup and tap-to-pick map destinations

- An opted-in **complete** U.S. street address can now produce a U.S. Census/TIGER address-range suggestion while it is being typed, without first clicking Start navigation. MapTiler or self-hosted Photon still provides early partial-address autocomplete when available. The public Photon demo is explicitly best-effort and cannot be relied upon for address completion.
- Set the main destination field to a search input without a native datalist. Move the MapTiler API-key password input outside the destination `<form>` so Firefox is less likely to misidentify the destination as a login field. Prevent native password manager suggestions from obscuring results where possible; browser extensions remain outside OpenRF's control.
- Search suggestions appear as an accessible dropdown with arrow-key/Enter/Escape support, debounce adjusted to provider type, stale response cancellation, and immediate local saved-place matches. A selected result retains its exact coordinates; raw fuzzy matches are never silently chosen.
- Map destination picker now switches to a visible crosshair mode, captures the precise tap location even over a GPS marker/observation pin, displays a temporary destination pin, and restores normal map panning afterward. Tap the picker a second time or press Escape to cancel. Does not save GPS/observations.
- Show an explicit positional-uncertainty reminder for Census address-range matches. Online search continues to require per-page opt-in, does not upload browser GPS and does not save travel history. Real local Valhalla road routing is unchanged.
- Add live-input UI behavioral tests and backend/API tests for consented Census lookup before submission, U.S. city/state completeness, provider selection, credential-form separation and keyboard selection. No SQLite schema change, new dependency or private-data export.

## v0.2.29 — Private MapTiler autocomplete setup and clearer map navigation

- Optional MapTiler Geocoding key can be saved, tested and deleted directly from the map. Keys stay in private Ubuntu configuration outside Git; never embedded in source ZIP or returned by a status endpoint.
- Public Photon remains a best-effort alternative. No external search happens unless the current browser page opts in, including when a MapTiler key exists.
- Separate the address-search checkbox explanation onto a smaller second line; keep Start navigation full width.
- Clarify address resolution versus local Valhalla route-calculation progress and errors; show search attribution with candidates.
- Regression tests for key permissions, non-disclosure, consent, cross-origin rejection and U.S.-only suggestions; no private database migration.

## v0.2.28 — Address lookup fallback and map picker

- Add explicit, opt-in U.S. Census one-line address geocoding for completed street addresses on route submission. This is **not** live autocomplete; candidate positions are approximate TIGER street ranges.
- Keep Photon suggestions as an optional best-effort feature; improve message when the public demo refuses requests. Increase typing debounce to reduce unnecessary requests.
- Add a one-tap Choose on map destination shortcut next to the destination field to route with Valhalla even when all address services are unavailable.
- Preserve local routing and route-label honesty; do not change investigation or GPS storage.
- Add focused backend and frontend regression checks, release test instructions.

## v0.2.27 — U.S. address candidates and optional local routing installer

- Search queries to Photon use the US country filter; MapTiler uses `country=us`. Explicitly foreign results are discarded, and supported street-address components are formatted in the expected U.S. order.
- Text addresses must be selected from the results to avoid routing to an unrelated first geocoder match. Saved named destinations and coordinate pairs still resolve without geocoding.
- The Start navigation button occupies a full-width separate row below the online-search opt-in control on touchscreen and desktop sizes.
- An explicit local Valhalla status check and optional Docker/WSL setup helper were added. Setup downloads Northern California OSM data only when the user runs `--install`; road graphs remain private and outside Git. Road coverage, turn-by-turn guidance, and hardware performance remain unverified.
- No required new Python dependencies, RF changes, or private database migration.

## v0.2.26 — Readable map, address-search opt-in and navigation entry cleanup

- Restored the legible OpenFreeMap Liberty basemap as the default, retaining optional dark style.
- Destination input now spans the available width; a single compact paper-plane **Start navigation** button appears below. The action plans a route or labeled direct-line reference; continuous turn-by-turn navigation is NOT implemented.
- Added unchecked-by-default opt-in for public Photon address autocomplete: only typed address queries are sent, never browser GPS. An operator can still self-host Photon or configure MapTiler. The public demo service is rate-limited, online-only, and not a guaranteed production provider.
- Fixed stale-location route attempts by requesting a fresh browser fix on demand when necessary; no tracking or saved route history.
- Made address lookup/routing failures clearly visible instead of silently returning to the map. Missing Valhalla produces a labeled dashed direct-line reference, NOT driving directions.
- Preserved local data, hardware readiness, manual observations, map tiles, investigations and archived Android code. Route preferences such as avoiding highways, mapped ALPR cameras or incidents remain planned only, not implemented.

## v0.2.25 — Dark map, optional geocoding, local Valhalla road routing

- Defaulted the MapLibre basemap to OpenFreeMap Dark and improved the recenter icon contrast on its white button.
- Reordered the Plan a trip accordion ahead of Map settings; simplified start/destination inputs and added up to 10 ordered intermediate stops.
- Added address autocomplete via locally hosted Photon or optional MapTiler key. Without a configured geocoder, typed addresses show a clear unavailable message; saved names and coordinates remain local.
- Added a loopback Valhalla route adapter with strictly validated coordinates and decoded polyline6 road geometry, planned mile/time summaries and maneuvers. On failure, clearly marked direct-line references remain available; no remote demo routing or fabricated road data.
- Fixed missing server-side navigation.js static asset delivery, which could prevent any preview from loading.
- Added regression tests and setup documentation; GPS tracking, traffic, camera alerts, RF detection and live road guidance remain out of scope.

## v0.2.24 — Map-first navigation layout and routing research

- Replaced the dedicated Navigation page with a compact destination bar above Survey Map and an optional expandable Plan a trip section below it. Search supports locally saved destination names and typed coordinates only; unknown addresses fail clearly (no online geocoder or road route exists yet).
- Automatically use browser-reported position as navigation origin when permission allows, unless the user deliberately sets a different origin; no background tracking, auto-save or external requests.
- Added a browser location recenter control beneath zoom/compass in both MapLibre and the local raster fallback; a stale or absent fix prompts a permissioned location request.
- Moved local basemap picker and offline map preparation below the map and GPS waypoint controls; moved manual observation Use my location after its accuracy field. Map actions and legal attribution remain accessible.
- Evaluated Rural Route's prior MapLibre, HERE/Google Directions and TomTom work. Documented future local Valhalla routing integration; no real route or police/ALPR alerts implemented.
- Expanded frontend tests for functional destination parsing, control placement, browser-origin defaults, and no false road-routing claims. No DB migration, sensor change or new dependencies.

## v0.2.23 — Navigation preview foundation and compact map controls

- New Navigation workspace: explicitly entered start/destination coordinates, one-click fresh browser-start fix, map-click destination picker, straight-line preview with great-circle distance and bearing; always labelled **NOT A ROAD ROUTE**. No turn-by-turn directions, online geocoding, automatically recorded tracks, police alerts or camera avoidance yet.
- New bounded, local SQLite saved destinations table with GET/POST/DELETE API and strict validation. No existing observations, captures, waypoints, or session data are overwritten. No background tracking, scans, or external navigation requests.
- Removed redundant Add observation button below map, shrank + and Layers controls to quiet 32px borderless controls, moved observation Use my location directly below longitude and reduced attribution disclosure visual weight while keeping legally required credits accessible.
- Regression tests cover navigation geometry, validation, persistence, API origin boundaries, map picking, the non-route disclaimer, and UI safeguards. Browser-specific visual behavior and real-world routing are not verified.

## v0.2.22 — Observation form location shortcut and readiness refresh fix

- Corrected a v0.2.21 startup JavaScript regression: `readiness` was requested in `Promise.all` but omitted from the destructured bindings, causing `Readiness is not defined` and a misleading server-connectivity warning.
- Added an explicit, opt-in **Use my location** button to the shared manual observation dialog; validates a fresh browser fix, fills coordinates and accuracy without auto-saving, and handles permission failures, cancel/reopen, edits and stale results.
- Manual observations persist browser-reported coordinate provenance and fix age in existing columns. Unsupported claims of RF sensor measurements and precise transmitter locations remain prohibited.
- Added actual refresh-function and browser geolocation callback regression tests, backend/HTTP provenance tests and CI coverage. All previous source, local data isolation, optional maps and hardware drivers retained; no new dependency or migration.

## v0.2.21 — Hardware readiness, stability and compact map controls

- Added a read-only Hardware readiness checklist and private, intentionally requested JSON diagnostic export with explicit unavailable, disconnected, permission-denied, stale, unverified and not-implemented statuses. The checklist never triggers scans or probes.
- Hardware refresh now reloads sensor diagnostics, including last user-requested scan/probe outcomes. A previous USB response cannot be presented as current after a port disappears or the probe becomes stale.
- Improved five-inch Survey Map controls: reduced the lower-right Layers button to 44px with a familiar stacked-layer icon, and added a matching **+** button to open the manual observation dialog. It does not attach inferred device/location coordinates; tapping the map still populates chosen location coordinates.
- Increased vertical spacing between the full-width manual observation button and the GPS-linked waypoints card.
- Added backend and frontend regression tests; retained existing scanner, mapping, offline maps, saved evidence, reports, ESP32 firmware, radar roadmap and archived Android source. No private data migration, radio transmission or new dependency.

## v0.2.20 — GPS-linked manual survey waypoints

- Added an explicit, per-click browser geolocation waypoint workflow on Map, linked only to an active investigation session. Each fresh fix stores observer coordinates, accuracy in meters, browser fix time, fix age in seconds and server receipt time, optional note, and `BROWSER_REPORTED` provenance. No background geolocation watch or route tracking.
- Added an additive `survey_waypoints` SQLite table with session linkage and idempotent migration. Existing observations, captures, local investigation data and demo state are preserved. A location waypoint is not an RF measurement, transmitter location or verified external GPS fix.
- Saved survey waypoint points can be optionally displayed in MapLibre and the built-in offline raster/coordinate map. Waypoint visibility is off by default; no inferred travel line connects separate readings.
- Added session-limited GeoJSON export of precise waypoints with an explicit user confirmation; local deletion requires confirmation. Export warns that precise observer locations can reveal personal routes or routines. No automatic uploads.
- Added HTTP, validation, schema/migration and frontend contract tests; retained signal-history analysis, investigations/reports, map-area tools, Wi-Fi/ESP32 sensor modules and future radar/navigation roadmap. Real GNSS hardware and physical Firefox testing are not yet verified.

## v0.2.19 — Compatible signal timelines and private CSV export

- Replaced the older identifier-only signal graph on Analysis with a time-scaled historical timeline keyed to the same compatible source/device/hardware/frequency/metric identity used by the v0.2.17 comparison engine. Different RSSI dBm and NetworkManager quality % measurements are never silently merged.
- Added all/24-hour/7-day/30-day windows anchored to the **newest saved reading** (not clock time), visible median/min/max/count and selected start/end timestamps, a recent-measurements detail table, and clear historic-data and observer-location cautions.
- Large histories downsample **only for drawing**, retaining minima and maxima within each bucket. All matching readings continue to contribute to summary statistics and selected-series CSV export; the visible chart discloses its point count.
- Added CSV export of the current series/window with timestamp basis, hardware identity, provenance, and session references. Precise observer GPS fields are excluded unless the user checks an explicit opt-in. Spreadsheet formula-like text is escaped. Synthetic DEMO readings are also excluded by default.
- Added browser contract and computational tests (incl. dense data, outliers, identical timestamps, privacy, and CSV injection prevention), registered in Linux CI. No new Python packages, database migration, live RF detection, automatic network uploads or change to navigation/hardware capabilities. Existing map, offline packages, scanner, USB, investigations and archived Android remain intact.

## v0.2.18 — Private printable investigation reports

- New Sessions report controls: choose an investigation, preview/print a self-contained HTML report, save HTML, or export structured JSON. Reports are read-only and generated from one SQLite snapshot, not from truncated browser history.
- Reports include session metadata, saved observations with provenance and notes, zero-result captures, included source/category counts, and separate min/median/max summaries grouped by identifier, device, hardware ID, source, frequency and unit. No distance/source-location inference or invented live scan status.
- DEMO observations and precise survey coordinates are excluded by default; explicit opt-ins and report cautions are provided. Data caps and any truncation are clearly reported. HTML output escapes all user-entered fields to prevent injected markup.
- Added report/unit/HTTP/front-end tests and Linux CI coverage. Preserved v0.2.17 signal comparisons, saved filters, map UX, offline maps, serial/ESP32 code, archived Android source and future radar/navigation roadmap. No data migration, new package dependency or automatic upload.

## v0.2.17 — Source-aware historical signal comparisons

- Added an optional, collapsed comparison panel on Analysis for stored measurements: earlier/later comparison or explicitly selected investigation sessions with median, range, counts, UTC-recorded time spans and descriptive change.
- New offline comparison engine keeps demo records opt-in and separates series by identifier, signal category, source, source device, hardware ID, frequency and unit (RSSI dBm versus NetworkManager quality %). Includes missing-value and date safeguards and cautions about observer positions, hardware identity and unverified or stale measurements.
- Added local CSV export with baseline/follow-up labels and preserved evidence/provenance fields; escapes spreadsheet formulas and changes no existing SQLite records.
- Served the new script through the loopback static resource allowlist and added Node regression tests to Linux CI. No dependencies, background sensing, map changes, radar or navigation implementation.

## v0.2.16 — Saved observations explorer

- Added source, session, age, mapped-observation and time-direction filters to the existing Saved observations screen. Search and category/demo controls remain available.
- Investigation Records shortcuts now open an editable session filter; Clear filters resets controls without reloading.
- Added local filtered CSV export preserving source/provenance and measurement units with spreadsheet-formula protection and a DEMO opt-in requirement. Existing full-file exports remain unchanged.
- Expanded pure JavaScript regression tests; no database migration, new dependency, sensor activation or location tracking.
- Preserved v0.2.15 maps, USB/ESP32 source, radar roadmap and archived Android work; running Firefox and physical sensor tests still require operator validation.

## v0.2.15 — Wider overview and smooth browser location camera

- The Survey Map now starts farther out so the opening camera shows much more of the continental United States before any location permission is granted.
- Browser location recentering now uses an explicit animated duration instead of a capped fly-to that could degrade into an instant snap on large jumps.
- The built-in raster/coordinate map starts from the same wider overview so online and offline map modes feel consistent.
- Automatic recentering still yields to manual map movement, and reduced-motion operating-system preferences are respected.


## v0.2.13 — Animated browser location camera

- Restored MapLibre `flyTo` on successful browser geolocation so Survey Map visibly pans and zooms from the U.S. overview (or current view) instead of jumping instantly. Bounded animation and reduced-motion preference included.
- Fixed pending geolocation during asynchronous vector style startup or raster fallback: do not initialize the map already at the target location, and do not discard a location request before the map is ready. Continue to respect user map gestures over an automatic recenter.
- Added a smooth cancellable camera transition in the offline coordinate-grid renderer; real offline tiles and survey pins continue to render during motion. Touch drag, wheel or zoom buttons interrupt the transition. Manual location uses the same camera path.
- Clarified that offline area management is optional tile management. Retained all v0.2.12 source, offline map plans/import, sensors, ESP32 firmware, scanner, investigations and Android archive. No storage migration or new dependency.
- Added JavaScript behavior tests including camera readiness, motion preference, stale epoch and raster frame interpolation. Browser and physical-device testing are still pending.

## v0.2.12 — Offline ZIP tile import and provider-neutral acquisition plan

- Saved areas now export compact `.plan.json` descriptors (XYZ tile ranges, geographic bounds, zooms and candidate tile counts) to help obtain appropriately licensed source material elsewhere. No remote tile URL or downloading in these files.
- Added a browser import for **user-supplied** licensed XYZ/TMS raster tile ZIP archives. Input `z/x/y.png`, JPEG or WebP (optional `tiles/` or single folder prefix) is validated, clipped to an existing saved geographic area, and converted into a new raster MBTiles package using TMS rows. Users must specify the source and visible attribution, confirm offline/derivative rights, and select the correct tile row scheme.
- Added size, tile-count, path, CRC, symlink, duplicate-tile and mixed-format safeguards with private staging, no overwrite, no extraction into paths and no external network calls. Source files and observation SQLite data remain untouched. Unknown/partial coverage explicitly reported.
- Added synthetic ZIP conversion tests and HTTP end-to-end tests, frontend checks, setup instructions and limitations. Existing plans, MBTiles importer, subset builder, mapping, scanner, USB firmware, radar roadmap, investigations and archived Android project retained. No SQLite migration.


## v0.2.11 — Geographic area selection and local MBTiles subset building

- Added touch-friendly two-corner map selection (MapLibre or coordinate-grid fallback), visible-viewport capture and editable bounding coordinates with zoom and tile budget validation. Observation clicks are suppressed during area selection.
- Named area plans persist as private local JSON adjacent to maps. Users can view planned bounds, export GeoJSON, and remove plans without affecting installed maps or SQLite investigations. Planning areas does **not** download tiles.
- New guarded server-side local raster MBTiles subset builder. It copies only licensed, already-installed source tiles overlapping a saved area; uses an explicit operator rights acknowledgement, a 10,000-tile/512 MiB payload cap, staging with no-overwrite atomic publish, source attribution retention, and zero-coverage errors. No public tile prefetching or network calls.
- Added new area/planner/backend/HTTP tests and retained v0.2.10 map imports, ESP32 serial firmware, radar hardware roadmap, surveys and archived Android source. No database migration.


## v0.2.10 — Offline map area manager and long-range radar planning

- Browser-based local **raster MBTiles import**, bounded to 1 GiB and streamed in 1 MiB chunks. Reject invalid metadata/tiles, unsupported vector packages, unsafe names, duplicates, incomplete transfers, and symlinked map entries. Installs with atomic no-overwrite publish into private `maps/` directory.
- Survey Map area manager now shows declared boundaries, zoom span, format, attribution, and on-disk size. **View area on map** centers the local offline renderer; explicit confirmation is required to **Remove selected map**, and the investigation SQLite database is not modified.
- Kept existing manual copy workflow, no online area downloads or automatic map cache scraping. No imported maps placed in Git or source ZIP.
- Added an explicit **NOT IMPLEMENTED** radar receiver entry to hardware capability and sensor registry; added [docs/RADAR_RECEIVER_ROADMAP.md] describing required future **receive-only** X/K/Ka police radar and independent LIDAR sensor plans; not implemented, no validated range or hardware performance claims.
- Added import/HTTP/data-preservation regression tests and retained all existing Linux hardware/ESP32, mapping, and session functionality. No database migration.

## v0.2.9 — Offline raster mapping foundation and raster 403 fix

- Removed all requests from the built-in fallback to public `tile.openstreetmap.org` raster tiles. This avoids the reported 403 blocked tile images and respects the OSM tile usage prohibition on offline prefetching. The existing Web Mercator coordinate-grid, pan/zoom, browser location, GPS-aware map camera, saved survey pins and optional DEMO filtering remain usable without tiles.
- Added read-only local **raster MBTiles** enumeration and XYZ-to-TMS tile serving through `/api/maps` and `/api/maps/{id}/tiles/{z}/{x}/{y}.png`. Supports prebuilt PNG/JPEG/WebP basemap archives only, scoped to `<private-data-directory>/maps/` outside Git and the updater. No network fetching, auto tile download, or source inference. Includes file/coordinate validation, symlink restrictions, format and image-signature checks, and optional overzoom at package edges.
- Added an offline basemap chooser and refresh status on Map, plus package-specific attribution. Added optional one-time MapLibre library caching to `<private-data-directory>/assets/` with online CDN redirect when absent; **online vector tile styles still need connectivity**. No bundled basemap imagery or MapLibre binary library in this release.
- Added `docs/OFFLINE_MAPS.md`, map licensing/privacy notes, Python MBTiles tests, API tests and JS layout checks. Database and ESP32 code unchanged. Hardware, browser field testing and internet-based MapLibre caching have not been verified here.



## v0.2.8 — ESP32-S3 experimental firmware and clearer USB diagnostics

- Added `firmware/esp32-s3-openrf-serial-v1/` containing a first source-only Arduino-ESP32 3.x firmware sketch. ESP32-S3 Wi-Fi STA runs a **user-triggered passive 2.4 GHz AP scan** and returns up to 32 BSSID/MHz/RSSI dBm observations using the existing `openrf.serial.v1` USB protocol. Firmware advertises WIFI only; no BLE, 5 GHz, GPS, SDR, automatic scanning or simulated live values. Device-reported RSSI is uncalibrated.
- Firmware omits UTC capture time without GNSS/NTP clock; host labels retrieval-time-only observations with unknown measurement freshness. Explicit firmware errors are rejected as failures rather than stored as zero-result captures. No new SQLite migration.
- Added read-only serial port group/access hints to Hardware, clearer device busy/permission/disconnect messages, and regression coverage for firmware payload validation and error states. Corrected a pre-existing Wi-Fi scan exception handling mismatch that could return HTTP 500 instead of an unavailable state; updated version expectation in API tests.
- Retained v0.2.7 maps, NetworkManager Wi-Fi, snapshots, sessions, export, archived Android source, loopback-only API, and updater format. Python and JS tests run locally; **no firmware compilation, physical USB device, ESP32 scan, or Raspberry Pi touchscreen validation** performed.


## v0.2.7 — USB serial sensor protocol and one-shot capture

- Added `openrf.serial.v1` opt-in USB serial transport with inventoried-port allowlisting, a bounded protocol handshake, one-shot snapshots, strict payload validation, 3-second request deadlines, and explicit error states. No serial device is opened automatically. A compatible device needs custom OpenRF firmware; generic USB devices do not produce measurements.
- Added touch-friendly hardware controls to probe one Linux-visible `ttyUSB` / `ttyACM` port or explicitly request and save a single snapshot. WSL normally needs USB passthrough before a compatible sensor appears. Probe does not capture RF data.
- Snapshot data carry device-reported hardware ID, measurement timestamp when supplied, host retrieval time, unverified source identity, freshness/clock-skew warnings, measured MHz and/or dBm, optional browser observer coordinates, and an investigation session link. Missing measurements are rejected; zero-result snapshots remain recorded as zero results. No claimed source geolocation.
- Additive SQLite migration preserves previous observations and survey captures; new optional fields track timestamp basis, device-reported UTC time, and hardware identity. Probed-but-unverified modules are never classified as connected verified sensors.
- Preserved native Wi-Fi scanner, map, session history, handheld layout, and archived Android source. No ESP32 firmware, working hardware receiver, BLE/SDR/GNSS driver, automatic scans, or physical RF verification is included.


## v0.2.6 — Real scan snapshots, session-linked surveys and sensor diagnostics

- Added an explicit **Save scan snapshot** action on Map and Analysis, separate from the existing per-access-point Save buttons. Saves all not-yet-saved access points from a verified short-lived server receipt in one database transaction; handles zero-result scans without inventing signals. No background capture was enabled.
- New session-linked survey capture history with returned/saved counts, Linux interface, UTC retrieval time, unverified freshness, optional observer coordinates, browser fix age at scan request, and observer-location source. Observation export now includes capture group ID and `signal_quality_percent` metadata. The chart can display separate NetworkManager quality (%) history without mixing it with RSSI (dBm).
- Browser location opt-in takes a recent fix available **at scan request time** and refuses attaching a later location to an earlier scan. Browser coordinates are unverified survey positions, never inferred transmitter locations.
- Added read-only sensor diagnostics and an in-process last-retrieval status; missing WSL radio hardware still correctly reports unavailable.
- Automatic non-destructive SQLite migration adds a `survey_captures` table and nullable measurement/provenance columns, preserving existing observations/sessions and archived Android source. New backend/API, migration, receipt, and responsive layout tests.
- No BLE/SDR/GPS driver, native Wi-Fi packet capture, live scan on physical hardware, source localization, or live background tracking is claimed.

## v0.2.5 — Right-side field controls, dependable GPS zoom, sensor receipts

- Moved the compact hamburger to the top-right, with the vertical navigation drawer sliding from the right. Retained desktop sidebar, accessibility/focus behavior, and no-horizontal-scroll small-screen layout.
- Changed Layers & Scan to an icon-only, 52px map button anchored at the bottom-right. Map status, filters and scan operations remain in its expandable panel. Tightened map heights on handheld screens to keep the launcher visible without scrolling.
- Repaired a timing race between browser geolocation and MapLibre style startup. A valid permission-granted fix now holds a pending camera target and applies street-level center/zoom once the vector map finishes loading (or immediately in raster fallback). User panning after the request takes precedence. The blue location marker is not stored automatically.
- Replaced the intrusive long map-credit bar with a small, accessible **Map credits** disclosure on the map. Credits to OpenFreeMap, OpenMapTiles and OpenStreetMap remain accessible; the MapLibre logo itself is not required. No new map API key is necessary.
- Added `openrf/sensor_connections.py` and `GET /api/sensors` for a typed, explicit driver readiness registry. NetworkManager Wi-Fi is the only actionable adapter; BLE, SDR and GNSS remain not implemented.
- The existing one-shot Wi-Fi scan now issues a short-lived, server-owned receipt. Users can explicitly save individual AP results to local observations through `POST /api/sensors/networkmanager-wifi/save`. Only a BSSID present in the actual returned scan can be saved once per scan. Saving preserves the NetworkManager interface, retrieval UTC timestamp, frequency/channel/security, and **signal quality percentage only** — never fabricated RSSI dBm or transmitter coordinates. Optional user-approved browser survey coordinates are marked unverified receiver positions. A running investigation is linked when selected.
- No changes to the SQLite schema or archived Android source. No scanning is possible on WSL without a compatible Linux-visible Wi-Fi interface, and stored scan results can be cached. No BLE, SDR, GNSS or physical hardware drivers were claimed as tested.

## v0.2.4 — Hamburger navigation, responsive measurement cards, hardware shopping plan

- Replaced compact fixed bottom navigation with a top-left hamburger that opens a vertical, touch-friendly drawer. Tap a destination, close button, outside backdrop, or Escape to close. Desktop navigation and map-first compact landing remain unchanged.
- Compact signal and Wi-Fi measurement tables now show stacked labeled entries, avoiding horizontal table swipes and wrapping long identifiers. Hardened other panel widths for small screens.
- Added a staged hardware shopping plan, separating minimum Raspberry Pi starter parts from optional Wi-Fi monitoring, SDR, GNSS, batteries, and specialized modules. No purchases or physical hardware tests have occurred.
- Preserved map geolocation, map layers, scanner API, SQLite schema, investigations, exports, Linux tests, and archived Android source. No database migration.


## v0.2.3 — Five-inch touchscreen layout and map-first wireless workspace

- Responsive 5-inch portrait/landscape layout with fixed bottom navigation, touch-friendly controls, app-style map landing page and drawers, while preserving the desktop overview. Tested with browser emulation at 720×1280, 1280×720, 390×844 and 1450×900; hardware screen tests pending.
- The Survey Map now owns a **Layers & Scan** drawer. Toggle saved geotagged survey categories (Wi-Fi, BLE, RF, cellular, infrastructure, manual); markers use per-category colors in MapLibre and raster fallback. DEMO stays hidden by default. Observer positions are explicitly distinguished from transmitter locations.
- The existing one-shot Linux NetworkManager AP request can also be launched from the map panel. Its results remain temporary, marked as potentially cached, with no geolocation, RSSI dBm, or automatic map pins. Detailed Analysis page remains available. No background scan is activated.
- Retained browser GPS prompt and centering behavior, SQLite schema, saved data and archived Android sources. Improved map raster notice placement and made handheld drawer stay above the bottom navigation.
- Added responsive/filter regression checks; no live radio hardware or Pi touchscreen was available for validation.


## v0.2.2 — Browser GPS centering and first Linux Wi-Fi survey adapter

- On first opening the Survey Map, request browser geolocation (subject to browser permission) and center/zoom based on reported accuracy: 15 for ≤1 km, 13 for ≤5 km, 11 for coarser fixes. Add a separate **browser location** marker. Location is in memory only, never stored as a survey observation or transmitter position. Prevent late geolocation from overriding manual map movement; do not repeatedly prompt during navigation.
- Fixed the **Raster fallback / Try vector map** button and preserved map center/zoom when switching map modes. Added a status line for location permission denial, timeouts and desktop/VPN accuracy limitations. Raster fallback can display a browser-location marker without external map libraries.
- Added `openrf/drivers/wifi_nmcli.py`: an opt-in one-shot NetworkManager Wi-Fi AP survey when a compatible Linux Wi-Fi interface is visible. Read-only result display, no automatic retention, includes SSID/BSSID/channel/frequency/security and NetworkManager signal **quality %**. Time is retrieval time; entries may be cached and are not RSSI/distance/GPS. Scan may emit normal Wi-Fi probe frames. No continuous or background scanning.
- Scanner shows a one-shot scan panel; Hardware reports whether the NetworkManager adapter prerequisites are visible. Missing Wi-Fi interfaces (normal on WSL) result in a clear error instead of fabricated signals. Rate limiting and a command timeout prevent repeated uncontrolled invocations.
- Added Linux Wi-Fi parser and scan tests, browser geolocation/fallback regression assertions, `docs/NATIVE_WIFI_DRIVER.md`. All prior observations, SQLite schema, and archived Android files are unchanged.
- Live Wi-Fi scan remains **hardware unverified**; no BLE/SDR/GPS scanning or automated investigations are claimed.

## v0.2.1 — Map recovery, UI spacing, and hardware inventory

- Fixed MapLibre 6 classic-script mismatch by pinning the compatible MapLibre GL JS 5.24.0 UMD distribution. OpenFreeMap Liberty/Dark styles remain the primary online map.
- Added an independent in-app raster/coordinate map fallback (no JavaScript CDN dependency). It tries OSM raster street tiles online, and shows a functional coordinate grid, manual map-click observations and saved pins without them. No offline street basemap is bundled.
- Corrected CSS grid vertical centering: headers on Overview, Map, Scanner, Discoveries, Investigations, Hardware align. Added spacing above Scanner measurement records.
- Added read-only Linux USB descriptors, serial endpoints, network and Bluetooth interface visibility to Hardware; USB serial numbers are deliberately excluded.
- Added regression tests for hardware inventory, map projection, CSS consistency and browser fallback behavior. No changes to SQLite schema or private records.

## v0.2.0 — Linux/Raspberry Pi foundation

- Replaced Android APK as the primary target with a local Linux service and browser-based UI for WSL and future Raspberry Pi use.
- Added local SQLite survey observations, manually started/finished investigations, search/filter/delete, RSSI history visualization, CSV and GeoJSON exports, and map-based manual observation entry.
- Added read-only Linux/WSL hardware capability inventory, a sensor driver protocol stub, explicit unsupported/unconnected RF states and opt-in synthetic DEMO data.
- Added GitHub Linux test workflow, Windows PowerShell/Ubuntu startup scripts, and test/documentation suite.
- Archived v0.1.6 Android source without replacing private phone data or claiming conversion of the Android Room database.
- Removed obsolete active Android APK workflow. Existing Windows updater can still display its old APK wording.

See `legacy/android-v0.1.6/CHANGELOG.md` for versions 0.1.0–0.1.6.
