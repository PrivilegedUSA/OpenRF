## v0.2.76 — Opt-in local Meshtastic history and conversations (2026-11-15)

- Add opt-in private SQLite message history stored beside OpenRF's local data, not under the release or Git repository. Saving is **off by default**; disabling it erases saved message bodies. Provide a separate Clear messages action. Retain at most 1,000 saved text messages, or 100 RAM-only session messages.
- Group received and sent messages into selectable node/channel conversations; offer a Reply action on genuine received node IDs that pre-fills destination and channel but never sends without submitting the form.
- Preserve explicit USB connection and normal/relay-focused firmware boundaries. No silent transmission, fake mesh signals, automatic node connection, Reticulum integration or RF delivery guarantees.
- No external dependencies added. Optional Meshtastic Python SDK remains needed only when connecting hardware. Radio, routing, map and source resources retained.
- Limitations: SQLite message history is **not encrypted at rest**, and the USB port is not a cryptographically verified radio identity. Real LoRa hardware and delivery remain untested.

## v0.2.75 — Quiet map taps and opt-in Meshtastic text foundation (2026-11-15)

- Stop opening Add Survey Observation from ordinary blank vector/raster map clicks. Destination picking and area selection continue to consume explicit map taps; existing camera and survey marker click actions remain intact. The + Add Observation button and Saved-page add action are unchanged.
- Add an offline-first Meshtastic USB bridge behind an optional Python SDK import. Explicit device selection/connection, no auto-probing on startup, and read-only capability/status before connecting. Support bounded channel broadcast and direct node-ID text send, received decoded text, and truthful submitted-to-radio (not delivered) receipts. Last 100 messages are kept in RAM only and purged on disconnect/restart.
- Add Normal and Relay-focused app modes. Relay-focused mode blocks composing in OpenRF but does not change radio firmware roles, inject repeater packets or claim live relaying without a connected and correctly configured radio. The preferred Meshtastic CLIENT firmware already supports automatic intelligent retransmission; obsolete REPEATER firmware role is not used.
- Group Mesh Messaging with Radio on the five-inch-friendly UI. Default disconnected state is read-only; all outgoing text and connection attempts require user actions. No required dependencies, internet accounts, SQLite migrations, automatic RF scans or uploads.
- Register `navigation_health.js` as a locally served static asset (missing from previous HTTP allowlist), preserving the v0.2.74 GPS watchdog in actual browser runs. Add mock USB/HTTP/UI regressions and a hardware setup guide. Real hardware delivery, LoRa coverage, repeater operation and Raspberry Pi/WSL USB permissions are not yet field-tested.

## v0.2.74 — Map marker hover and GPS loss/recovery (2026-11-15)

- Make mapped ALPR/speed/red-light camera reports and clickable survey observation, SDR survey site and waypoint dots display a hand-pointer cursor on vector map hover. Ordinary map dragging retains the normal cursor; destination, area and road point selection do not inherit the pointer. Raster camera buttons already advertise clickability.
- During user-started live navigation, show a small GPS quality state chip. If no new valid real fix has arrived in 15 seconds (based on the original fix timestamp, not repeated calls), pause live maneuver timing, suppress lane/camera/voice prompts and show a signal-lost warning while preserving the complete planned road route and its turns. A subsequent fresh accurate/approximate fix re-enters the existing conservative guidance path. Mark DEMO explicitly and exclude it from the watchdog.
- Add deterministic JavaScript tests covering all five clickable vector layers, pointer restoration/selection modes, GNSS fix age, initial wait, lost-signal one-shot pause and approximate recovery. Full source packaging and Python tests unchanged; no SQLite migration or new network service.
- Real GPS dropout/reacquisition, 5-inch Pi display and moving-road alerts still require on-device field validation; this release does not claim a live GPS test, traffic updates or CI success.

## v0.2.70 — Third-and-later destination picks (2026-11-14)

- Fix the repeated destination-selection lifecycle after multiple route calculations: the map-pick action is idempotent and cannot silently toggle itself off when invoked again. Search/Escape still cancel intentionally.
- Register capture-phase pointer-down/pointer-up handling on the map surface, retaining the existing click fallback. A deliberate stationary pointer release chooses the selected geographic point even if MapLibre or an SVG route overlay handles the later click. Route-control buttons remain clickable.
- Guard against click-through after a selected destination and against dragging being misinterpreted as a destination tap. Preserve map pan restoration and clean old route/turn/comparison invalidation when a destination actually changes.
- Add a four-cycle destination-pick regression suite and run a real DOM Chromium test with repeated map/SVG clicks, a drag, and toolbar interaction. No live Valhalla or real device/browser session was verified; this needs checking in the user's installation.
- Retain all previous features, source paths, regional offline maps, camera database code, and private-data boundaries.

## v0.2.69 — Repeatable map destination picking (2026-11-14)

- Fix the regression where **Choose destination on map** could stop accepting taps after calculating an earlier route: use a map-container capture handler so taps on MapLibre and sibling route/pin overlays are handled consistently.
- Make destination picking and road/gate avoidance-point picking mutually exclusive; starting a new destination cancels any unfinished road-point selection and restores the map's tap behavior. Opening typed search also cancels an unfinished destination pick.
- Always disable MapLibre panning when re-entering destination-pick mode and restore its previous setting after a successful pick/cancel. Native map controls and other interactive panels remain excluded from destination taps.
- Preserve the previous v0.2.68 route-reset behavior, persisted camera/layer/road preferences, right-side map controls, local offline tiles and routing backend. No location logging or external requests are added by this fix.
- Expand map-pick regression coverage to a **second** destination after a completed route, including taps on a route-overlay sibling and a pending road-exclusion tap state. UI browser-to-server testing is environment-limited; the user's real MapLibre/Valhalla interaction still needs confirmation.

## v0.2.68 — Clear obsolete routes on destination changes (2026-11-14)

- Make the Selected destination action card align in width and left edge with expanded Search, Directions and Choose a Route sheets; preserve clickable right-side map controls.
- On choosing a new destination, clear the prior route geometry, turn list, nearby-camera counts, camera comparison and stale Choose a Route cards together; saved camera/road preferences remain intact.
- Apply the reset to map picking, drag-adjusted pins, typed destinations and selected autocomplete results. Temporary per-trip road exclusions are cleared for a different destination; saved exclusions remain.
- Ignore in-flight Valhalla responses started for a previous destination so an old route cannot suddenly reappear after a fresh map selection. Merely opening or closing search does not discard an unchanged plan.
- No modifications to the Valhalla backend, hardware, camera source data, offline maps or the approved right-side toolbar. Actual road routing and Raspberry Pi hardware are not field-verified.

## v0.2.67 — Search and route review transition cleanup (2026-11-14)

- Collapse Destination Search on a successful road route from Get directions, including quick routes and multi-stop previews, but keep it open for routing errors.
- When re-opening destination search, temporarily hide Directions and Choose a Route without losing the current route.
- On close, measure and restore Directions and Choose a Route against the compact search bar. Avoid the old stale position after toggling forms or asynchronous camera comparisons.
- Keep active route selection, saved road exclusions, offline maps, and right-side map controls unchanged.
- Add layout/transition regression coverage and repeat tests on a fresh release extraction.

## v0.2.66 — Consistent navigation sheet widths and sticky direction exports (2026-11-14)

- Match expanded Destination Search, Choose a Route, and Directions sheet widths/alignment, leaving the floating map tool rail usable on narrow screens.
- Move Print, Save HTML, and Save JSON into the non-scrolling Directions header section under the route summary.
- Keep exactly one scrollable Directions content region for turns, descriptions, avoid-road actions and privacy notices; no nested scrollbars.
- Preserve compact collapsed search, live route/alternate selection, camera-aware routing, road avoidance, local map data and all hardware features.
- Add browser layout and markup regression checks for the new behavior; no new server-side dependencies.

## v0.2.65 — Map layer persistence and navigation sheet cleanup (2026-11-14)
- Retain Wi-Fi, BLE, RF, cellular, infrastructure, manual, ALPR, red-light and speed-camera layer choices locally in the current browser; no sync, login, or server upload.
- Honor unchecked camera layers after manual additions and national camera-data refreshes instead of automatically re-enabling them.
- Remove the nested scrollbar from the planned turn list; keep the Directions heading sticky inside the one outer scroll region.
- Leave room for the map's right-side controls on handheld widths and restyle the Layers/Map Tools X buttons to be centered, compact and borderless.
- Add regression checks for persisted toggles and layout. Existing routing, offline resources and data remain unchanged.

## v0.2.64 — Route-choice panel spacing (2026-11-14)

- Place the Choose a Route panel at least 12 pixels below the **actual** collapsed Directions heading, including wrapped multi-line text.
- Reposition on layout changes, viewport changes, and Directions heading resizing. Keep the panel scrollable on shorter screens.
- Preserve the currently working road-avoidance recalculation, route comparison, visual styles, and the complete direction list.
- Regression coverage and release audit in `docs/RELEASE_0.2.64_TESTS.md`.

## v0.2.63 — Route-choice spacing and complete avoidance directions (2026-11-14)

- Place **Choose a route** below the collapsed Directions summary, not over it. Hide the choice cards while the turn list is expanded, restoring them when the list closes.
- Display highway, toll, ALPR/Flock, red-light and speed-camera preferences together as one plain list. Keep advanced road/locked-gate point exclusions collapsed and removable.
- Remove redundant `Leg 1` labels from planned directions, active guidance lists and printable route sheets; multi-stop numbering is handled by the order of steps.
- Guard excluded-road responses: if the final reported maneuver stops more than 150 m short of the end of the returned road geometry, reject the incomplete route. When the user recalculates after avoiding a turn, preserve the prior road and entire previous directions list on failures and show an error.
- Regression tests for completed vs truncated guidance, plus 800×480 layout checks and small-screen review.
- Limitations: This safeguard detects missing final directions but cannot prove every intermediate instruction is correct. Real road-exclusion requests against the user's running Northern California Valhalla graph and moving GPS have not been tested here.

## v0.2.62 — One-stop avoidance settings and per-turn road exclusions (2026-11-14)

- Put **ALPR/Flock**, **red-light**, and **speed** camera avoidance switches directly alongside highway and toll preferences, with no extra master opt-in. Camera categories are all initially off, and explicit choices persist locally in the current browser. The original route remains selected unless the user chooses a different one.
- Collapse the rarely used road/gate exclusion editor by default; show its active count and retain remove controls for both trip-only and browser-saved exclusions. Move address search/provider options into a separate collapsed section so route settings are visible on a 5-inch screen.
- Add an **Avoid this road** action to individual mapped turn-by-turn directions, choosing **This trip** or **Save for future trips**, followed by **Recalculate directions**. Use a bounded point on the outgoing road instead of the intersection itself and reject turns without suitable road geometry. Do not promise avoidance of an entire named street or of a locked gate.
- Keep existing route selection, conservative off-route GPS behavior, saved local radio and camera data, map tool rail, and offline basemap intact. No new API, external services, radio scans, tracking, or map tiles.
- Add regression tests for turn-point selection, UI/source contracts, and small-screen isolated layout checks. Physical moving navigation, actual Valhalla exclusions, browser persistence across updates, Raspberry Pi and GitHub CI remain unverified.

## v0.2.61 — Selectable route lines and consolidated avoidance settings (2026-11-14)

- Remove the overlapping camera-route chip; open camera, highway, toll and road/gate avoidance preferences together in existing Map route settings. Fix route-comparison feedback when no alternate can be calculated.
- Display a calculated camera-aware alternate with an amber dashed road line and compact route choice cards; tap a card or available alternative road line to select. Preserve existing road until the user explicitly changes it, and prevent switching while active navigation is in progress.
- Support Valhalla `use_highways:0` and `use_tolls:0` preferences and bounded named/gate **point exclusions** chosen from actual route maneuvers or a map tap. Support temporary and browser-persisted exclusion points separately. Do not represent a road name alone as an exact exclusion; private/locked gate restrictions remain data-dependent.
- Thread selected avoidance preferences through normal local routing, optional camera comparison and GPS off-route recalculation, with 8-point combined limit and conservative fallback when no alternative exists. No new external services, RF drivers, location telemetry or modifications to local map data.
- Add focused backend/UI tests and a standalone release checklist. Physical GPS drive, actual Valhalla alternative routing, Raspberry Pi and GitHub CI remain unverified.

## v0.2.60 — Camera options integrated directly into navigation (2026-11-14)

- Move camera-route comparison out of the hidden Directions turn list into a dedicated, compact **Camera routes** overlay on the main Map. The overlay is reachable from destination search, the map-picked destination card, the route-preview chip, and active navigation; it uses the approved dark teal map style and can be closed without changing route or location.
- Add explicit opt-in to consider selected ALPR/Flock, red-light and speed-camera reports during future directions and accurate GPS off-route recalculations. When enabled before **Get directions**, automatically request an evidence-limited local Valhalla comparison, but **never switch from the normal route without selecting Use alternative**. Display reported-camera counts, time and distance tradeoffs, and avoid offering a non-improving alternative.
- Hide the map-picked destination card once a verified road route is shown, avoiding overlap with the route-options chip. During live navigation, the camera option button is available; selecting an entirely different planned route requires stopping safely first. Future off-route recalculations use the user's explicitly enabled categories and preserve ordinary routing if camera alternatives are unavailable.
- Preserve the v0.2.52 map-first layout, right-side tools, local Valhalla and GPS behavior, offline basemap bytes, national ALPR local store, radio, survey, investigations and archived Android work. No new external feeds, accounts, mandatory packages or RF drivers.
- Add UI contract and isolated 800×480/phone/short landscape checks. Actual driving, live Valhalla camera exclusions, browser GNSS, external camera downloads, and Raspberry Pi hardware remain unverified. Camera locations are reports; routing cannot promise camera-free travel or override traffic laws.

## v0.2.59 — Opt-in spoken turns, mapped lane hints, traffic-free ETA (2026-11-14)

- Navigation: request `turn_lanes:true` from local Valhalla and preserve bounded verbal maneuver fields and optional mapped lane bitmasks, with strict validation; do not infer lane directions when tags are missing or invalid. No new server calls except existing loopback road routes.
- GPS follow: add an explicit **Voice off/on** button to the live navigation HUD. Use browser/OS speech synthesis only after opt-in, and only for upcoming maneuvers during fresh, accurate moving GPS/GNSS fixes; speak once near a turn and once closer, not on every update. Mute during uncertainty/off-route, and stop/cancel on Stop, page change or DEMO. No recorded audio or external speech API is added.
- Display Valhalla lane directions/active-lane hints beside live turns only if supplied by OSM-derived road data. Lane arrows are advisory and must be checked against real signs/markings. Show approximate remaining ETA with an explicit **no live traffic** label; do not invent traffic speeds, incidents or closures.
- Preserve the v0.2.52 map style and right tool rail, v0.2.58 camera comparison and conservative rerouting, existing saved radio/ALPR/investigation data, and offline map bytes. Resize only the *driving-mode* guidance HUD so voice/lane panels do not cover the map controls on 800×480.
- Add 2 Python + 1 JavaScript navigation tests, update historical fixture versions and release checklist. Physical moving GPS, browser TTS audio, OSM turn-lane coverage, Valhalla live Docker and Raspberry Pi have not been verified. No new required dependencies or traffic provider accounts.

## v0.2.58 — Camera-aware route comparison, conservative GPS recalculation, reliable Valhalla reuse (2026-11-14)

- Valhalla: starting OpenRF checks Docker and restarts the existing `openrf-valhalla` container (bounded, best effort). Never automatically downloads, builds, creates, or changes existing graph storage; opt out with `OPENRF_VALHALLA_AUTOSTART=0`.
- Local camera route reports: source-labeled, roughly 120 m proximity of ALPR, red-light and speed camera records to the verified Valhalla polyline; bounding-box and response limits; no fabricated locations or claimed enforcement direction.
- Optional comparison: request a route excluding selected community-reported camera road locations, compare distance/time/nearby reports and explicitly choose an alternative; original stays in place if unavailable. Uses Valhalla's `exclude_locations` on loopback only.
- GPS follow: conservative off-route gating (repeated precise moving fixes; delay and cooldown), local reroute with no stored travel trace, clear errors and fallback, destination vicinity indicator. A selected camera-aware preference is compared again after rerouting. Never reroutes on DEMO, inaccurate, stale, or stationary fixes; intermediate-stop trips still require deliberate replanning.
- Added tests for startup reuse, camera-route math, comparison failures, and off-route safety; updated HTML/CSS and release documentation. Unchanged Map layout, offline basemap resources, existing radio and investigation functions.
- No physical GPS, Raspberry Pi, or live Docker/Valhalla route-confirmation test from this environment; use the real Northern California road graph and browser on the target system.

## v0.2.57 — Readable camera popups and read-only Valhalla diagnosis (2026-11-14)

- Restyle only camera report MapLibre popups with OpenRF's dark navy/teal palette, readable text, styled source link and close control, matching marker tip and touchscreen-sized scrolling. Preserve source labels and no-tracking wording; camera points are community-mapped, not necessarily operational.
- Add a read-only `tools/setup-valhalla-wsl.sh --doctor` command to distinguish missing Docker integration, missing/not-running Valhalla, graph still building, and example Sacramento-to-Auburn routing availability. It checks only local loopback and never downloads source files or modifies user graph data.
- Leave existing map controls, offline basemap, saved nationwide ALPR database, and radio features unchanged. A **real Valhalla graph still must be built and running separately**; the ZIP does not contain large graph downloads. The user's own Docker/Valhalla runtime was not accessible for live verification.
- Add source and stubbed CLI regression tests, release checklist and versioned browser asset refresh.

## v0.2.56 — Nationwide ALPR snapshots and optional offline Valhalla routing regions (2026-11-14)

- Replace unreliable Overpass-only camera discovery as the primary import with an **explicit optional nationwide ALPR snapshot download** from a published community OSM-derived GeoJSON feed. Validate, stage and atomically replace only the national snapshot's private SQLite data; manual camera locations and the red-light/speed categories remain untouched. Browser loads only points in its map viewport. A local GeoJSON(.gz) file import remains available if the direct online download fails. Never treat community locations as independently verified.
- Expand the existing **optional Valhalla local road routing setup** with isolated region profiles for Northern California, all California, US West (including Nevada), and the entire US. Add `--plan --region`, explicit `--install --region`, local-data persistence, checked large-dataset disk/RAM minimums, resumable source downloads, fixed upstream URLs, source header sanity checks, Docker pre-pull and best-effort recovery on switch failures. Full-US graphs require substantial computer resources; nothing is auto-downloaded or bundled.
- Keep **road-routing graphs separate from visible basemap tiles**. The original Amador/Calaveras offline vectors and approved v0.2.52 map styling remain unchanged. No camera-aware rerouting or live road/traffic updates are implemented.
- Add offline CLI regression tests, unit/API/browser-source tests for national ALPR snapshots, an optional Valhalla coverage guide, and fresh-ZIP verification notes. No live national feed, actual Valhalla large graph build, RF hardware, GPS or Pi/CI success is claimed.

## v0.2.55 — Area-limited OSM ALPR import and unified map layer toggles (2026-11-14)

- Fix the oversized national ALPR feed failure by changing the opt-in import to **bounded OpenStreetMap Overpass ALPR queries for only the selected viewport** (with fixed providers, validation, response caps and fallbacks). This uses the same upstream OSM surveillance tags as DeFlock/FlockHopper; the national FlockHopper snapshot is no longer downloaded. The selected bounds are shared with Overpass only when explicitly requested, not on startup. Import availability depends on external services and has not been live-tested.
- Preserve source-linked and `COMMUNITY_MAPPED` status for imported ALPR pins. Existing saved/manual camera entries and the separate red-light and speed types remain unchanged; no invented camera positions.
- Move all nine map categories into one consistent 2-column checkbox grid; replace the extra camera accordion with visible camera-management controls. Add spacing and touchscreen-friendly wrap for Reload and Import, without touching the v0.2.52 right-side map tools.
- Add focused bounded-query, failure, persistence, endpoint and frontend regression tests plus a field checklist (`docs/RELEASE_0.2.55_TESTS.md`). No avoidance routing/alarms or new RF hardware features are implemented.

## v0.2.54 — Optional traffic camera layers &amp; CHIRP channel imports (2026-11-14)

- Add a private SQLite camera catalog and separate opt-in ALPR/Flock, red-light enforcement, and speed enforcement layers, accessed in the existing Map → Layers overlay. Markers distinguish camera *infrastructure reports* from RF observations, with color-coded categories and evidence states. Camera locations are not preloaded, verified, scanned, or automatically tracked.
- Add manual source-labeled camera entry. A user-selected `VERIFIED` label requires a documentary URL; other reports are `REPORTED` or `REMOVED`. No agency association is inferred from an unknown ALPR entry.
- Provide a user-triggered ALPR area import using the fixed published FlockHopper/DeFlock community OSM-derived GeoJSON feed (`https://data.dontgetflocked.com/cameras.geojson.gz`). Bound and validate compressed/decompressed payloads and geographic extent (max 8°×8°); locally filter before saving to SQLite. Imported entries remain `COMMUNITY_MAPPED`, with OpenStreetMap/DeFlock/FlockHopper credit. **No feed network calls occur automatically; sync has not been live-tested and is subject to remote service availability.** No location is transmitted in the data feed request.
- Add import-only CHIRP CSV channel profiles for the UV-5R, BF-F8HP and other compatible exports, stored in private SQLite. Separate channel labels, frequencies, mode, offsets and tones. Copying a frequency to the RTL-SDR tuner form is a manual UI action only; no Baofeng connection, programming, audio or transmit control.
- Add `/api/cameras`, `/api/cameras/import-osm`, `/api/radio/profiles` endpoints, bounded request parsing and migration-safe private SQLite tables; server stays on loopback. No credentials, signed keys, user GPS data or personal captures are added to the release.
- Preserve v0.2.52 approved right-side map layout, existing SDR, radio, navigation, map resources, tests and archived Android code. Add tests and release checklist `docs/RELEASE_0.2.54_TESTS.md`. Physical radio hardware, live feed download, Chromium HTTP map routes, Raspberry Pi and GitHub CI not verified.

## v0.2.53 — Receive-only radio clips and tuner workspace (2026-11-13)

- Added a dedicated **Radio** workspace with frequency entry, NFM/AM/WFM receive selection, tuning example buttons, 5–15-second opt-in capture and browser playback of completed mono WAV samples. Audio is short-duration and **not live streaming**; no transmission or automatic recording.
- New `openrf/radio.py` invokes a Linux `rtl_fm` executable (not bundled) with strict fixed subprocess options, tuning limits, timeout/stop and bounded output conversion. The latest successful sample exists in memory only until another attempt or restart; no disk persistence, GPS linkage or uploads. Clear missing-tool/hardware/error states; PCM output is not proof of meaningful reception or verified device identity.
- Added loopback-only radio status/start/stop/audio API and a shared start lock preventing concurrent OpenRF RTL spectrum sweeps and radio reception. Unchanged map layout from v0.2.52, offline map resources, observations, SDR capture files, navigation and Android archive.
- Extended regression coverage with synthetic PCM subprocess stubs, validation, HTTP security, stop, WAV playback and SDR/RF contention, plus frontend/800×480 visual checks. No physical RTL-SDR, WSL USB passthrough, Raspberry Pi radio hardware or GitHub CI verified.

## v0.2.52 — Consistent Map Control Appearance (2026-11-13)

- Unified the collapsed 40px destination bar and compact 40px hamburger alignment.
- Moved the four floating tool buttons to the right, directly under the zoom/compass/recenter controls, matching their quiet teal-on-dark appearance. Tool overlays now open to the left of that stack. Added measured alignment in vector and raster map modes, with short-screen rail scrolling.
- Preserved existing navigation, map panel interactions, hardware tools, offline map assets, attribution and all local-only data behavior.
- Refreshed app asset version query strings and added dedicated regression checks. No backend data or schema migration.

## v0.2.51 — Destination action and floating map workspace overlays (2026-11-13)

- Replace the misaligned Tools down-arrow/scroll jump with four left-side fixed SVG icon controls; new **Plan a trip**, **Map settings**, **GPS-linked surveys**, and **Offline maps** overlays keep the existing live HTML controls and original DOM nodes, without cloning or changing saved data. Close by icon/X/Escape; overlays stay inside the map viewport and scroll internally at 800×480.
- Fix one-tap destination picking: map search collapses for placing a pin and a compact selected-location action card immediately exposes **Get directions**. The card mirrors Start navigation only when the already-existing Valhalla route gate verifies a real road route. Coordinate selection still never stores an RF survey point or assumes a transmitter position. Resetting/dragging a pin invalidates old guidance.
- Prevent Map page re-selection from unexpectedly resetting an already-expanded destination search; preserve entered destinations and existing routing/survey behavior.
- Distinguish MapTiler 400 (bad/overlong query/params), 401/403 (key restrictions), 429 (rate/quota), and other upstream HTTP errors without exposing key/URL. Error message offers saved locations, map selection or local Photon, rather than suggesting MapTiler setup when the provider is already configured. **An actual MapTiler request/key has not been tested.**
- Extend regression tests for source/overlay privacy and MapTiler status code classification. Isolated Chromium tests verify 800×480, phone, desktop layout with stub background and overlaid panels; server routing, live tiles, hardware and Pi tests remain unverified beyond existing automated tests.
- Preserve all v0.2.50 managed paths, offline map resources, Android archive, static source and existing Linux workflows. No new dependencies, migrations, RF scanning, transmitter-location claims, server exposure, automatic uploads or geocoder requests on startup.

## v0.2.50 — Map-first touchscreen layout, no extra Focus Map mode (2026-11-13)

- Remove the redundant header Focus Map / Exit focus mode after user testing showed it exposed too little additional map space. The standard Map workspace now uses the full available viewport by default, including 800×480 five-inch landscape and 390×844 phone-sized screens. Other pages retain their existing layout and menu.
- Make the existing single destination-search form **collapsed by default**, with a compact floating **Where to?** control; expands into an on-demand overlay. Preserve address suggestions, route planning, map-pin destination selection, typed text, offline routing, planned directions and navigation follow controls. Escape collapses the form (unless a separate map-pin selection is in progress). No new GPS requests or network calls are triggered by the toggle.
- Float the hamburger at top-right on compact Map view; leave persistent desktop navigation intact. Reposition top-right vector/raster controls to avoid being pushed below large destination popovers. Preserve map layer/add buttons, source credits, and survey markers.
- Provide discoverable, non-driving **Tools ↓** scroll to below-map trip planning, offline map management, survey and settings sections. Existing tools are not removed or migrated.
- Preserve v0.2.49 backend, SDR/Wi-Fi/BLE drivers, observations, navigation, user data boundaries, offline map MBTiles and Android archive. No new dependencies or radio reception/transmission implemented; see docs/RELEASE_0.2.50_TESTS.md for limitations.

## v0.2.49 — Five-inch field map controls and ham radio design (2026-11-13)

- Add keyboard-operable destination-search collapse to clear the map surface on a small touchscreen, without losing the current input or triggering new navigation/location requests.
- Add one-tap Map focus mode with an explicit Exit focus action, safe page-switch reset, resize of vector/raster maps and temporary concealment of the below-map workspace; all legacy map tools remain available outside focus mode.
- Preserve attribution and existing offline map/source resources; no backend API/database changes or new dependencies.
- Document potential ham-style **receive-only** SDR audio and optional CAT radio control under `docs/AMATEUR_RADIO_ROADMAP.md`. This is a plan, **not working radio reception or transmission**.
- Add v0.2.49 JS/UI regression checks and a small-screen browser smoke test plan in `docs/RELEASE_0.2.49_TESTS.md`.

## v0.2.48 — Recorded SDR bin history (2026-11-13)

- Added on-demand read-only frequency history across up to 16 completed private RTL-SDR sweeps with exact 1 Hz bin matching, optional investigation filter and same-tuning guard (on by default).
- Added capture-order trend chart, count of excluded/missing records, historical sample table, and opt-in CSV export without precise coordinates. DEMO, failed and stopped captures cannot enter history.
- Preserve local-only processing, bounded capture controls, map/navigation/offline tiles, previous capture comparisons, and archived Android source. No automatic scan, inferred transmitter location or calibrated dBm claim.
- Added JavaScript tests and release smoke-test guide; no external SDR receiver or real GNSS tested.

## v0.2.47 — Opt-in mapped SDR survey sites (2026-11-13)

- At explicit short RTL-SDR capture start only, optionally request one *fresh browser-reported operator location* with timestamp, age and accuracy; validate its shape and freshness in the local Python backend. Never call this verified GNSS, antenna site or transmitter source. Geolocation is OFF by default, cannot be supplied as RF evidence, and a requested denied/stale fix cancels that start request. Captures without a fix still work by default.
- Optionally associate a newly started capture with an active investigation using its ID; association lives in private capture JSON (existing SQL session observation and snapshot counts are unchanged). No automatic background GPS tracking, radio scanning, or receiver identity inference.
- Expose location-bearing **completed** sweeps as read-only, locally stored SDR survey sites, plus a precise-coordinate opt-in GeoJSON export. Failed/stopped runs and old recordings without a location never appear as geolocated evidence. Mark sites as RECORDED / NOT LIVE, operator browser location at sweep start, unverified receiver identity and uncalibrated reported dB.
- Show optional pink site markers on both vector and raster maps; layer OFF by default, filter by investigation, clear popup/legend caveats, no tracks or heatmaps. Keep the 800×480 touch interface compact.
- Fix capture-start error message that was overwritten by an immediate hardware status refresh after a denied location request.
- Add six backend validation/API/lifecycle tests, one JS survey integration contract test, updated older version assertions and refresh mock, and a Playwright 800×480 opt-in/location-denial UI smoke test. Preserve all existing source and bundled offline map resources. No new Python package, migration, RF driver, automatic upload or CI-success claim.

## v0.2.46 — Offline RTL-SDR bin analysis and capture comparison (2026-11-13)

- Add pure browser-local SDR bin aggregation: frequency centers rounded to 1 Hz, arithmetic mean of reported dB across recorded frames, per-bin sample counts, median level and spaced strongest-bin table. No claim of calibrated dBm, signal classification, or transmitter position.
- Add an opt-in offline comparison of current spectrum with a selected saved capture or independently chosen local CSV baseline. Reject incompatible grids instead of interpolation; report exact-bin coverage, positive/negative differences, prominent changes and explicit synthetic-DEMO and timestamp caveats.
- Add local CSV download of aligned comparison data, clear stale result when current file, baseline, or frequency display range changes. Fix outdated SDR hardware / planned receiver descriptions; no new server endpoint, hardware scan, file upload or database migration.
- Add browser-side pure-model tests and UI contracts. Preserve existing v0.2.45 capture process, source/ZIP paths, MapLibre/MBTiles assets, navigation, wireless drivers, saved investigations and Android archive. See `docs/RELEASE_0.2.46_TESTS.md`.

## v0.2.45 — User-started bounded RTL-SDR CSV capture (2026-11-13)

- Add `openrf/sdr_capture.py`, an explicit user-started 5–30 second `rtl_power` receiver-index-0 process with conservative input limits, no shell, no arbitrary browser paths, one capture at a time, stop/timeout and safe server shutdown termination. No boot-time or automatic scans.
- Validate actual CSV rows and bound capture file size before marking success. Do not treat command presence or exit code alone as receiver proof. Capture state distinguishes `RUNNING`, `COMPLETE`, `STOPPED`, `FAILED` and previously interrupted files; power remains uncalibrated dB and sample timestamp timezone unverified.
- Store operator-requested CSV and metadata under the private repository data folder, outside source/Git/SQLite observations. Add loopback-only start, stop, status, list, CSV download and delete endpoints with strict JSON/ID validation. 50 retained metadata records at most, explicit deletion in Spectrum.
- Add compact Spectrum controls for frequency, bin step and duration, opt-in Start/Stop, saved capture review/download/delete and recorded-not-live provenance. Keep local-file historical import and SYNTHETIC DEMO separate from captured measurement records. Update read-only SDR capability and hardware readiness text without claiming a verified receiver.
- Software-only validation using an obviously synthetic `rtl_power` stub; no physical dongle, real sampling/driver compatibility, Pi touchscreen or GitHub CI success has been verified. Existing Linux map, offline OSM resources, routing, observations, hardware integrations, reports, test suites and Android archive retained. See `docs/RELEASE_0.2.45_TESTS.md`.

## v0.2.44 — Unified read-only hardware connection overview (2026-11-13)

- Add a concise **Connection overview** at the top of Hardware, with one row per Wi-Fi, BLE, OpenRF USB Serial v1, SDR, external GNSS, Sub-GHz, cellular and radar/laser capability. On 5-inch field layouts the rows stack vertically. Refresh inventory updates this overview alongside existing device inventory, sensor registry and diagnostics.
- Introduce a read-only `GET /api/hardware/manager` contract: controller/device/tool counts, timestamp, evidence-limited states and specific next steps. A Linux interface or `rtl_power` executable is *prerequisite visibility*, **not** verified radio detection or live capture. Offline SDR CSV viewing remains distinct from live SDR receiver support.
- Distinguish USB protocol outcomes: unprobed, permission denied, recent failure, recent device-reported response, stale (>5 minutes or future timestamp) and disconnected. A recent reply does not verify device identity, RF calibration or a measured signal. No background scanning or GPS logging added.
- No new required packages, database migrations, Android builds, online services or network exposure. Existing offline MBTiles, navigation, survey workflow, Wi-Fi/BLE opt-in scans, USB protocol interactions, spectrum viewer, saved investigations and Android archive are retained.
- Software-only regression coverage: 174 Python tests (including normalized state and local HTTP API), 23 JavaScript suites, Python compile, JavaScript syntax, Bash syntax and source-ZIP invariants. Physical receivers, field GNSS, Raspberry Pi/Firefox touchscreen, GitHub CI and real RF signal acquisition were **not** tested. See [v0.2.44 test guide](docs/RELEASE_0.2.44_TESTS.md).

## v0.2.43 — Explicit field-survey planning and saved-evidence dashboard (2026-11-13)

- Add optional per-investigation planned receiver, site label, survey objective and private field notes. Add forward-only SQLite session-column migration; existing records are preserved and default to `UNASSIGNED`. Only active survey plans can be edited; strict field/length/enum validation prevents forged hardware declarations.
- Add active field survey status, quick receiver-workspace navigation, editable plan form, separate saving status in Analysis and Layers, plus exact saved observation/SENSOR/position/capture/waypoint counts. These are DB summaries, **not** real-time scanning status. No automatic scan, GPS logging or evidence insertion.
- Include escaped plan details in portable historical HTML/JSON investigation reports with caution that the plan is not hardware evidence; preserve source-device provenance of saved measurements.
- Add Python migration, HTTP/API, privacy and evidence tests and JS user-interface contract test. Preserve SDR CSV inspector, offline maps, routing, BLE/Wi-Fi, hardware interfaces and Android archive. No extra dependencies, no live RF hardware tested, no GitHub CI success assumed.

## v0.2.42 — Browser-local offline SDR spectrum foundation (2026-11-13)

- Add a dedicated responsive Spectrum workspace: local `rtl_power` CSV import, frequency-bin spectrum, historical waterfall, frame selection, view-only frequency range and distinct synthetic DEMO. No backend file upload, scans or saved observations.
- Add `openrf/sdr.py` read-only driver contract and `/api/sdr/status`, update SDR hardware readiness and registry; installed commands are not verified hardware.
- Add strict parser/model frontend tests, read-only API tests and validation guide. Preserve v0.2.41 sources, maps, RF/Wi-Fi/BLE, navigation and archived Android. No migrations or new dependencies. Real SDR hardware has not been tested.

## v0.2.41 — Read-only multi-location wireless survey positions (2026-11-13)

- Add strict identity-preserving comparisons of saved Wi-Fi/BLE/RF/cellular measurements across multiple recorded observer coordinates; no automatic RF scanning, GPS tracking, source localization, heatmaps or invented travel paths.
- Highlight the matching saved sample markers on both MapLibre and raster maps; show an on-demand chronological signal graph with timestamps, reported coordinate/accuracy, metric unit, and explicit measurement limitations.
- Show time/source warnings, including uncertainty-circle comparisons only where both reported accuracies exist. Never equate Wi-Fi quality percent with RSSI dBm; maintain DEMO/HISTORICAL labeling.
- Add read-only map-sheet collecting guidance and private opt-in export of precise observer positions. Preserve v0.2.40 Wi-Fi/BLE workflows, SQLite data, offline maps, Valhalla navigation, Android archive, and reserved updater paths.
- Tests: new pure JS unit/regression, unchanged Python API behavior, complete versioned ZIP checked. Physical scanners, Android, GNSS travel, live Firefox rendering, and GitHub CI remain unverified.

## v0.2.40 — Wireless survey map & saved-reading inspection (2026-11-12)

- Added independent category, measured RSSI (dBm), and NetworkManager quality (%) marker-color modes to the existing MapLibre / offline raster survey maps. No cross-unit conversion, distance inference, or invented locations.
- Added map time filters, a compact recent-mapped-wireless list and an inspector for saved observation identity, source device, timestamp, actual recorded measurements, observer coordinates/accuracy, plus compatible historical series and descriptive earlier/later medians.
- Added ephemeral BLE scan results and explicit one-shot BLE scan action in the existing map Layers & Scan sheet, sharing the validated BlueZ save workflow. No background scans or automatic saved locations.
- Added dependency-free survey-map presentation module, JS and HTTP regression tests, new documentation and static asset allowlisting. Preserved all v0.2.39 source files including maps/navigation/RF functions and Android archive. No database migration.
- Limits: no verified physical Wi-Fi or BLE scanner, no field-verified map layout, and no implied transmitter localization or calibrated signal gradient.

## v0.2.39 — Opt-in Linux Bluetooth LE discovery (2026-11-12)

- Add bounded, explicit BlueZ LE-only discovery for Linux-visible controllers; no pairing, connecting or background monitoring. Real LE events and optional reported RSSI dBm are displayed in Analysis. BlueZ discovery and per-device timestamps/caching limitations are disclosed.
- Add short-lived (10 minute) single-device save receipts and server-only BLE SENSOR provenance. The browser cannot submit arbitrary measured RSSI, device addresses not observed by the server, or false readings. Optional browser location is the observer position from scan time, never transmitter coordinates; nothing persists until Save.
- Hardware registry now reports BLE scanning readiness separately from whether a Linux controller and BlueZ are connected. WSL built-in Windows Bluetooth is normally unavailable.
- Add regression tests for parsing, controller absence, bounded invocation, failure/timeout, receipt rejection, no automatic records, location semantics, and foreground UI.
- Preserve prior source, RF/network/nav/map features, offline resource licensing and privacy. No SQLite migration or new runtime dependencies.

## v0.2.38 — Real Wi-Fi survey details, BLE readiness and persistent map settings gear (2026-11-12)

- **User-requested map settings cleanup:** keep the compact gear anchored at bottom-right next to Add and Layers while the settings popup is open. The popup has its own accessible **X** close button and also closes on Escape. Original lower-left map credits/info stay untouched. The MapTiler key remains private and unchanged; no geocoding credentials in the ZIP.
- **Actual Linux NetworkManager one-shot Wi-Fi:** request optional `MODE` and advertised `RATE` along with SSID, BSSID, channel, center frequency, signal-quality percentage and security. Label observed frequency bands 2.4/5/6/60 GHz (or unknown); allow local band and SSID/BSSID filtering and sorted quality display. Signal % is **NOT calibrated RSSI**, advertised RATE is not observed data throughput. Do not infer AP location from observer GPS. Existing manual save, evidence provenance and 10-minute scan receipt stay intact.
- **Read-only Bluetooth readiness:** inventory Linux hci controller presence and whether the BlueZ control daemon responds, without starting pairing, scanning, advertising or collecting Bluetooth addresses. BLE discovery remains **not implemented**, even if hardware is visible. Windows built-in wireless may be unavailable to WSL.
- **GitHub CI USB serial race:** release the per-server serial exchange lock before sending the HTTP response so a client sending a snapshot immediately after a probe response cannot encounter an artificial busy response. Still lock actual transactions. An isolated GitHub runner remains unverified.
- No new required runtime libraries, migrations, credentials, fake RF observations or hardware assumptions. All sources remain in project/, private data outside project/, with the approved OpenRF map sources unchanged.

## v0.2.37 — Actual code: labeled DEMO route travel and planned maneuver headline (2026-11-12)

- **Make the first Valhalla maneuver the main follow banner even with desktop ±100 m location**, using the explicit prefix **Planned:** and a separate accuracy line saying that LIVE timing is paused. No false road position or unsafe “turn now” is generated.
- Add an **explicit user-controlled DEMO route playback** inside the navigation HUD. After getting a real road plan and entering navigation, expand **Test route (DEMO · no GPS)** and press **Play DEMO**. Play/Pause/Resume/Stop, 1×/5×/20× simulated time; on-screen simulated marker is clearly orange/labeled **DEMO**, separate from the real blue browser GPS marker. Default virtual speed is 35 mph multiplied by the selected simulation speed. A numbered route's maneuvers advance as the simulated marker traverses the actual Valhalla geometry.
- **DEMO is never live location or RF evidence.** Turning it on stops the browser geolocation watch and local gpsd polling, excludes the real blue dot while playing, does not modify cached browser fix, and never posts simulated positions to OpenRF APIs, investigations, observations, or GPS waypoints. Leaving Map, Stop navigation, or Stop DEMO removes the marker and stops simulation timers. Browser/GNSS acquisition does not silently resume until Start navigation is explicitly requested again.
- Simulated MapLibre camera uses higher pitch (~55°), zoom (~16.8), route heading and behind-driver offset. Raster fallback remains 2D only. Camera pans suspend on user drag; crosshair resumes following. This makes visual navigation testable on a stationary desktop without claiming live driver motion, spoken alerts, real turn timing, or automatic rerouting.
- Adds pure route interpolation and explicit playback/cleanup tests in `tests/test_navigation_demo_v037.js`; CI now executes every JavaScript regression suite. Preserves all previously supported map data, Valhalla, saved route sheets, RF tools, local data/privacy controls, and archived Android source. No database migration or extra Python dependency. Live Firefox/Raspberry Pi GNSS and driving tests remain outstanding.

## v0.2.36 — Decouple visual follow from precise GNSS guidance (2026-11-12)

- Fixed the MapLibre follow camera being held flat/north-up by the ±75 m live maneuver accuracy gate. Now a confirmed Valhalla route immediately opens a **planned** forward-looking perspective, and a recent nearby approximate browser fix can recenter a tilted, route-oriented camera without pretending road geometry is a measured heading. Bright teal planned route retained.
- Added route-geometry look-ahead to derive a camera bearing as **planned direction only**, separately from actual moving GPS heading. High-quality moving GNSS remains the sole source of device heading; poor/stale GPS never enables live turn distance or turn-now claims.
- The follow panel reports camera source, accuracy and planned/live distinction. Manual pan suspends camera snapback; the crosshair resumes. Never save trail data. The raster fallback cannot tilt or rotate.
- Reused the original v0.2.35 source and retained custom offline vectors, local Valhalla route and turn lists, print/export route sheets, observations, RF tools and Android legacy.
- Added `tests/test_follow_camera_v036.js` and adjusted older camera expectations to reflect the new camera-only behavior. No migration, new services, or private data in ZIP. See `docs/RELEASE_0.2.36_TESTS.md`.

## v0.2.35 — GPS-follow planned turns and optional native GNSS (2026-11-12)

- Show a clearly labeled planned maneuver inside the GPS-follow HUD even for coarse/stale/denied browser fixes, with an expandable complete planned-turn list available while following; never label a planned turn as the active current instruction without a fresh accurate fix.
- Add an explicitly started, read-only localhost gpsd bridge. Normalize UTC fix time/age, receiver identity, speed/heading and conservative horizontal accuracy; clearly report unavailable, stale and missing-accuracy states. Browser geolocation remains fallback; prefer valid fresh local GNSS over a coarse browser position. Stop polling when navigation ends or map page closes. No automatic location recording.
- Retain camera positioning beneath map center and pitch/heading only for accurate moving fixes; no artificial position, direction, speed, police alerts or automatic rerouting.
- Add Python GNSS adapter/API privacy tests and JS follow behavior regression; preserve downloadable offline HTML/JSON directions, Valhalla routes, map tiles, RF tools and all older source. Raspberry Pi GNSS/Firefox vehicle behavior is not physically verified. Existing CI serial-capture flakiness is still under investigation.

## v0.2.34 — Road-sheet exports and focused GPS following

- Added an offline-only route guidance geometry/itinerary helper. Projects GPS onto road *segments* and estimates distance to the next Valhalla maneuver, with strict accuracy and off-route gates; does not invent movement or turn timing.
- Start navigation explicitly enters a cleaner map-focused driving view and shows the next maneuver and remaining distance when GNSS is sufficiently precise. Uses device moving heading, or travel between reliable fresh fixes; without trustworthy heading, stays north-up. No automatic rerouting/voice yet.
- Added a collapsible, numbered local road-direction list on the Survey Map. Print, save portable offline HTML, or opt-in full-coordinate JSON export without a server upload; route sheet survives without GPS.
- Preserved surveys, offline map resources, draggable destination, stored investigations, GPS privacy and Valhalla routing. No schema migration. Added regression tests for route progression, printable escaping, endpoint permissions and camera safety.
- Investigated historic intermittent CI serial-capture assertion; improved failure diagnostics, no unverified hardware claims. Desktop Firefox, Raspberry Pi GNSS and actual driving behavior remain unverified.

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
## v0.2.71 — New destination without dismissing route cards (2026-11-15)

- Make reopening the destination editor physically hide the previous Choose a route card while preserving the current plan if search is cancelled. Entering Choose destination on map now closes the previous route chooser immediately and clears stale route/directions state so taps can be accepted without pressing its X first.
- Prevent stale route review from reappearing during destination picking, including pending camera comparisons and later layout callbacks; treat the map-pick workflow as exclusive until a destination is chosen or intentionally cancelled.
- Fix a route-choice rendering crash when the camera comparison returns no alternative: the missing alternate button remains hidden instead of reading nonexistent route details. Preserve a valid main route and its complete directions.
- Add a four-cycle regression that starts with a visible chooser, reopens search, starts map selection and taps a new destination without manually closing the chooser, plus a single-route regression. Preserve the previous three-plus-cycle tests and current map/avoidance design.
- This is a focused UI reliability update. No new offline geocoder, camera approach warnings, external feed, hardware integration, or GPS changes; field navigation, live Valhalla and Raspberry Pi operation remain unverified.

## v0.2.72 — Preserve route on search, automatic single choice, local coordinates (2026-11-15)

- Keep the old road route and directions when opening Where to?, focusing the address input, typing a new draft, or arming Choose destination on map. The old route line remains visible as a non-interactive guide while waiting for a new point. Only a committed map tap, selected search suggestion, or successfully resolved Get directions attempt replaces it; cancel keeps the previous plan.
- Automatically use a sole drivable route without opening Choose a route; retain the selectable comparison panel if two drivable alternatives are returned.
- Recognize latitude/longitude input before external autocomplete. Stop sending a previously selected coordinate string to MapTiler when the input regains focus, avoiding a spurious HTTP 400. Preserve intentional typed-address suggestions.
- Add regression coverage for focused coordinates, draft edits, automatic single-route selection, delayed reset, four repeated map-pick cycles, and cancellation. Existing routing, hardware, privacy and map data behavior is unchanged.
- Tests run in Node/Python; full touch UI in Firefox, live Valhalla routing, and Raspberry Pi field operation have not been verified in this build environment.

## v0.2.73 — Evidence-limited offline camera approach alerts (2026-11-15)

- Add separate camera-approach preferences (ALPR, speed, red-light), persistent per-browser settings, and 0.25/0.5/1-mile route-ahead warning distances. Visual warnings default on during real GPS navigation; voice is an independent explicit opt-in.
- Add a compact camera report banner inside the active navigation HUD and optional spoken alerts with per-camera deduplication, clustered-voice cooldowns, and turn-prompt priority. Show report provenance and clearly state that camera operational status/direction are unknown.
- Only trigger warnings with a confirmed Valhalla road route, an accurate fix no older than five seconds, measured or defensibly inferred moving heading aligned with the route, and a point ahead along the route; never trigger for DEMO, stale/approximate GPS, wrong-way motion or off-route positions.
- Increase the bounded local route-camera report from 24 to 256 mapped sites for longer-route alert coverage; explicitly mark truncated reports as incomplete. No external GPS requests or location history storage are introduced.
- Add deterministic camera-report approach regression tests and server catalog coverage tests. Real-world GNSS accuracy, browser voice playback, Raspberry Pi performance and on-road alerts remain unverified pending hardware and field testing.

---

## v0.2.77 — Dedicated messaging workspace, unread indicator and Ham Radio page (2026-11-15)

- Split the former long Radio workspace into **Radio Receiver** (RTL-SDR receive-only samples), **Messages** (Meshtastic conversations, composing, opt-in private history and explicit USB/relay settings), and **Ham Radio** (read-only imported CHIRP channel lists).
- Add a compact Messages button in the header (including the map workspace) and sidebar with an unread count of new, genuine inbound text events. Reading Messages clears the count. Poll the existing local, read-only inbox every four seconds only after a node has been explicitly connected. No radio discovery, automatic connection, transmission, browser push notification or location logging.
- Introduce a monotonic in-memory receive sequence for reliable unread deltas even when the bounded chat list rolls over; old saved history and submitted outgoing texts are not counted. The unread badge is session-only and resets on browser refresh. Messages and source identity remain unverified until actual hardware testing.
- Separate USB device/relay settings and message storage into expandable panels, and keep conversation history above the compose form on small screens. CHIRP's “Copy to RTL-SDR tuner” opens the actual receiver page after pre-filling its frequency.
- Preserve offline navigation, camera alerts, radio sample APIs, Meshtastic firmware role boundaries, existing local-data privacy and full package structure. No schema migration, new dependencies or demonstrated live RF activity. Python/JS synthetic regression suites cover receipt counting and page separation; real Pi/LoRa device behavior remains untested.

## v0.2.78 — Borderless header controls and centered sidebar close (2026-11-15)

- Remove the visible border/background box from header Messages and menu icons on ordinary pages. Preserve touch-friendly button targets and visible hover/focus behavior.
- Hide the Messages header shortcut only in Map workspace to minimize distractions; the sidebar Messages entry and genuine unread count are unchanged. The map hamburger stays accessible over map imagery with a subtle borderless contrast surface.
- Replace the sidebar menu close X text glyph with a true centered SVG cross. Remove its border/background, preserve its accessibility label and interaction.
- No navigation, Meshtastic, radio, backend, persistence or hardware behavior changes; no database migration. UI regression coverage added. Real 5-inch device appearance remains to be checked after installing.

## v0.2.79 — Centered envelope shortcut in header (2026-11-15)

- Replace the Messages header chat bubble with a compact, simple envelope graphic. Retain its inbox navigation, unread badge, accessible label and behavior.
- Give the envelope and hamburger equal 42×42-pixel borderless, invisible touch targets aligned by their centers, while the envelope artwork is 18×18 pixels and the hamburger symbol stays larger. Reduce regular-header spacing to 2 pixels.
- Keep the messaging shortcut hidden on Map, sidebar unread badge and navigation unchanged. No RF communication, backend or database change; real device appearance remains to be checked after installation.

## v0.2.80 — Conversation replies and readable message composer (2026-11-15)

- Add an explicit reply-to-conversation action for observed Meshtastic node IDs; it pre-fills node and channel without transmitting anything. Unknown sender IDs cannot be auto-addressed.
- Show a live 180-byte UTF-8 message count, including multibyte characters, and disable Send when over limit. Preserve server-side validation.
- Avoid rebuilding unchanged chat history on four-second inbox polls and preserve a user's scroll position while reviewing older messages; stay pinned near the bottom when appropriate.
- Preserve v0.2.79 UI, offline map assets, optional message-history semantics and explicit USB-only radio access. No automatic transmission, new dependency or firmware role changes. Live LoRa and touchscreen behavior remain unverified.

## v0.2.81 — Local node directory and routing receipt states (2026-11-15)

- Add a local directory of nodes actually observed in messages, plus optional user-defined nicknames persisted privately in SQLite. No node is marked online merely because it appears in the directory. Saved labels are independent of opt-in message-body history.
- Add read-only node-list and operator-initiated nickname API endpoints, with node-ID, nickname-length and control-character validation. The five-inch Messages workspace can select a contact to address a direct message.
- For the real Meshtastic SDK, request direct-message routing acknowledgments through its supported response callback. Separate an ACK reported by the radio from recipient read confirmation; routing errors remain explicitly unconfirmed. Broadcasts still have no individual acknowledgments. Handle callbacks racing the send response and ignore stale connection generations.
- Preserve explicit USB connection and sending, history opt-in, normal/relay-focused radio behavior and the existing mapping tools. Fake adapter tests are not RF field tests; real SDK versions, LoRa links and device behavior require validation on actual hardware.

## v0.2.82 — Read-only USB diagnostics and compact touchscreen chat (2026-11-15)

- Show real Linux-side diagnostics for the optional Meshtastic SDK, reported USB serial ports and OS read/write accessibility, selected USB link and disconnected state. Do not open ports, scan for RF, invent firmware versions or imply reachability from a serial connection.
- Add a responsive two-column Messages conversation/composer layout for a landscape 5-inch (about 800×480) screen; preserve a stacked accessible form for narrower screens and all existing connection, privacy, history, nicknames and relay controls.
- Add regression checks for disconnected diagnostics, missing device paths and responsive markup. No new software dependency, transmit-on-startup behavior, database migration or map/navigation change.
- Limitation: Real WSL USB passthrough, Meshtastic SDK/device compatibility, Pi-specific 5-inch appearance and actual LoRa acknowledgments remain unverified without physical hardware.

## v0.2.83 — Opt-in Reticulum/LXMF LAN messaging foundation (2026-11-15)

- Add an independent experimental LXMF conversation interface with public address, operator-controlled LAN enable/stop/announce, validated direct text, and a bounded session inbox. Preserve Meshtastic USB, map, navigation, camera and SDR workflows.
- Run Reticulum only in a child process after explicit user action; terminate it on Stop and HTTP server shutdown. Private identity, configuration and LXMF runtime remain in local data outside Git and the release. The LAN AutoInterface is scoped to link-local discovery with transport and shared instance disabled; this does not provide a secret/private network.
- Report a requested route as **not sent**, and LXMF-router-accepted traffic as **queued, not delivered**. No fabricated peer discovery, live RF data, device connections, or delivery receipts. Do not auto-enable or send when the UI loads.
- Review the user-provided Haven MANET, RNode firmware and HF bridge repositories, record applicability, licenses and safety limitations in `docs/RETICULUM_LAN_AND_REPOSITORIES.md`; no external source or firmware is bundled into OpenRF.
- Add dependency-free Python/JavaScript tests for idle behavior, validation, private config and UI. Real RNS/LXMF transport needs optional packages and two-device LAN verification; this release does not claim successful over-the-air messaging, 5-inch hardware appearance or Wi-Fi HaLow integration.

## v0.2.84 — Optional TCP Reticulum listener and observed interface statistics (2026-11-15)

- Add an explicit, off-by-default TCPServerInterface listener on local TCP port 4242 for an Android Sideband TCPClient link when LAN multicast does not reach WSL. Its config is a private, generated runtime copy; the operator's existing AutoInterface config and private LXMF identity are not modified by switching transport options.
- Add read-only `/api/reticulum/diagnostics` and an expandable Messages panel reporting RNS's actual named interfaces, reported up/unknown states, available peer/client counters and received/sent byte counts. Absent counters display **unknown**, never invented zeroes. Announce request count and timestamp are local actions only; no claim of remote reception, route reachability or recipient delivery.
- Retain the loopback-only OpenRF HTTP server. The separate Reticulum TCP listener only opens after explicit Enable with its checkbox selected and closes on Stop. No automatic firewall modification, listening HTTP API, internet account, data uploads, Meshtastic bridge or hardware access.
- For newly generated Reticulum configurations, use the common `reticulum` discovery group. Existing operator-edited settings are preserved. Add API, config-safety and frontend regression tests, and Windows/Sideband test instructions in `docs/RELEASE_0.2.84_TESTS.md`.
- Limitations: no real Sideband connection, Windows Hyper-V/firewall traversal, RF hardware or LXMF delivery was verified in this build environment. Test on the user's actual WSL/Android network before considering it functional end-to-end.

## v0.2.85 — Combined Meshtastic/Reticulum unread badge and text overflow fix (2026-11-15)

- Reuse the existing header envelope and sidebar unread badge for the sum of genuine incoming Meshtastic and Reticulum LXMF messages, updating both the visible number and accessible label/title. No separate conflicting counter or new icon.
- Reticulum now polls its existing read-only inbox about every five seconds while explicitly enabled, including when another page is open; never automatically starts transport, announces, sends or scans. Count changes in the worker's genuine inbound `receive_sequence`, not outgoing texts, outgoing-queue states, old inbox history or TCP bytes. Counts are session-only, cleared on opening Messages or stopping Reticulum and shown as `99+` when appropriate.
- Add explicit word-wrapping and flex minimum-width rules for the Reticulum TCP checkbox text, interface names, and announcement details on narrow/5-inch screens, retaining original message and mapping layouts.
- Add dynamic JavaScript tests for both inbound streams, initial history, message reading, restart behavior and responsive CSS. No Python service API, database migration, radio firmware or OS firewall changes. The live Sideband-to-OpenRF LXMF receive path was user-verified on v0.2.84, but this new header counter and 5-inch layout require field testing.

## v0.2.86 — Compact teal unread badge over the header envelope (2026-11-15)

- Change only badge presentation: shrink the header's unread count to a 13px teal circle overlapping the envelope's upper-right corner instead of the earlier amber counter positioned beyond the button edge. Keep the clickable 42px header button unobstructed and preserve `99+` for large totals.
- Make the Messages navigation badge teal for visual consistency. Retain all existing v0.2.85 receive-sequence tracking, Reticulum TCP settings, privacy boundaries, and map-header behavior.
- Add a focused CSS/markup regression test. Layout still needs confirmation at the operator's actual viewport; live LXMF message delivery and unread count were confirmed by the operator on the previous release, but the changed appearance is not field-tested.

## v0.2.87 — Remove header unread counter border (2026-11-15)

- Remove the dark 1px outline from the compact teal count on the header envelope; leave the fill, numeral, upper-right overlap, unread behavior and sidebar badge untouched.
- No backend, network, identity, privacy, radio, map, routing or database changes. Add a targeted CSS regression assertion and retain the full release format. Visual appearance should be confirmed in the operator's real browser.

