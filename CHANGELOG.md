## OpenRF v0.2.194 — Surveillance history table compactness and sort affordances (2026-11-24)

- **History filters:** camera and date-range selects share a row on typical desktop/7-inch layouts, with responsive grid sizing; they stack on narrow content widths.
- **Sortable headings:** increase header font size modestly and replace outline chevrons with smaller filled up/down triangles, always visible; active sort highlighted in teal. Preserve keyboard operation and `aria-sort`.
- **Scope:** UI-only update. Existing recordings, settings, media and capture code are unchanged, with no new automatic connections or deletion behavior. See `docs/RELEASE_0.2.194_TESTS.md`.

## OpenRF v0.2.193 — Surveillance recording history spacing and clear sorting (2026-11-24)

- **Expanded playback spacing:** add 14px above the selected recording's inline player, matching the existing space below. Only the selected history row is affected; compact and touchscreen layouts remain within the scrolling table.
- **Always-visible sorting:** Date/time, Camera, Type, Status and Size headings now show paired up/down chevrons even before sorting. The active direction is teal, and column headers retain `aria-sort` and keyboard-operable buttons. The underlying sorting and date/camera filtering behavior is unchanged.
- **Safety:** display-only update; no camera connections, recording, media storage, credentials or database migrations changed. Includes focused JS regression checks. No actual webcam, Pi or installation tests. See `docs/RELEASE_0.2.193_TESTS.md`.

## OpenRF v0.2.192 — In-row recording playback, sortable history and optional audio (2026-11-24)

- **Local media history:** completed MP4 videos now have first-frame JPEG thumbnails generated from existing private recordings only on request. Select a thumbnail or date to expand playback directly under that row; select again to collapse or another to switch. Routine status polls preserve the currently expanded player. No prerecorded image is presented as a live stream.
- **Sort and time filters:** date/time, camera, type, status and size column headers sort ascending or descending. Added Today, Last 7 days, Last 30 days and All time date filter, alongside the existing camera filter. Filtering is read-only; cleanup remains a separate explicit confirmation workflow.
- **Opt-in recording audio:** camera settings have an off-by-default Include audio option. Compatible RTSP cameras may supply audio from the video stream. For USB, choose a separately listed ALSA microphone device; WSL may not expose it even when webcam video works. Local recordings encode requested audio to AAC and report whether the finalized MP4 actually contains an audio track (using ffprobe). No background microphone capture, remote access or automatic recording. Saved-video playback uses the browser's normal audio controls.
- **Safety:** saved files and thumbnails stay outside source and Git; thumbnail GETs use same-origin guards and strict numeric IDs. Cached thumbnails are removed with media. No physical camera, microphone, Raspberry Pi or GitHub CI verification. See `docs/RELEASE_0.2.192_TESTS.md`.

## OpenRF v0.2.191 — Surveillance media list, tab refresh state, USB preview bug fix (2026-11-24)

- **USB preview during recording:** removed a stale `refresh()` condition that forcibly stopped an already-open live feed each time the backend reported a USB recording. The manual recorder continues to release the original reader before starting its one-reader MP4+MJPEG capture; the frontend now allows the shared preview to stay open during status polling. A failed hardware capture still reports failure; this is not proof of hardware reliability.
- **Recordings UI:** replaced every-item expanded video cards with a compact list including date/time, camera, type, state, size and a View/Play control. Selecting a date or preview opens a single full player/details area with Stop & save (active), Download (finalized), Scan for motion (finalized videos) and confirmed Delete (inactive). Snapshot rows show real thumbnails from local files, while video rows show a play icon until selected—no fake frames. Keep the selected video DOM mounted across background status refreshes so playback is not interrupted. All assets remain private and local.
- **Refresh-safe workspace tabs:** persist the current tab **only on reload** in Surveillance, Emergency, Hardware, Weather, Meshtastic, MeshCore and Reticulum, using a small shared sessionStorage helper. Fresh app launch continues on main Overview; no radio/camera connections are triggered just by restoring tabs. Current per-workspace tab styling retained.
- Tests: new JS tab-state and list regression checks, browser smoke tests for list/detail, actual reload state and no media player recreation; existing Python/JS regression suites run locally. No NexiGo webcam or Raspberry Pi attached here; no GitHub CI or installation verification. See `docs/RELEASE_0.2.191_TESTS.md`.

## OpenRF v0.2.190 — Shared USB live view while recording, recording-card layout fixes (2026-11-24)

- For user-initiated **manual USB recordings**, replaced competing dual V4L2 readers with a single FFmpeg device input producing H.264 MP4 plus low-rate multipart-MJPEG preview. The original USB preview reader is closed on recording start, but OpenRF reopens its browser preview against the ongoing recording process. A bounded relay drops stale preview frames instead of blocking FFmpeg and continues draining video with no viewer connected. Stopping finalizes MP4 and reopens ordinary preview if it is still selected. This allows preview while recording without an additional USB device opening; it is an experimental Linux compatibility improvement, **not hardware-verified**.
- Restructured the five camera-overlay actions to Motion, Snapshot, centrally emphasized Record/Stop, Pause/Resume, and History. Pause/Resume sits immediately to the right of Record. Recording does not imply the image must stay visible; preview can be paused independently. No recording starts automatically on page entry.
- Constrained the recording-history grid, cards, and browser video elements with `minmax(0,1fr)` and explicit `max-width`/`min-width` rules, preventing the saved-video player and its actions from spilling outside their cards on compact and 1280px layouts. Existing Delete confirmation, motion history, downloads and disk isolation are preserved.
- Added synthetic FFmpeg tests for USB MP4+MJPEG output with an active viewer and with zero viewers, JS overlay-order checks and Chromium recording-card bounding-box tests at desktop/1280/800px widths. Camera performance, true NexiGo recording compatibility and physical Pi use are unverified. Details in `docs/RELEASE_0.2.190_TESTS.md`. No GitHub push or local installation performed.

## OpenRF v0.2.189 — Surveillance overlay grouping, per-camera history actions and USB recording handoff (2026-11-24)

- Reorganized the camera preview controls into three areas: an unobtrusive upper-right fullscreen icon, a centered bottom row for Pause, Snapshot, a larger red Record/Stop & save button, opt-in Motion clips, and per-camera History, plus a separate bottom-right digital zoom and optional V4L2 PTZ group. Inline, offline vector icons replace inconsistent Unicode symbols. Buttons are borderless with visible focus states. Removed the overlay toolbar's horizontal scrollbar. PTZ opens adjacent to/above the zoom controls depending on available tile space.
- Multiple requested previews remain a compact responsive two-column grid where supported. Single-camera fullscreen retains the same overlays. Zoom remains display-only, and extra black background is not revealed when panning.
- Recording history entries now place their media in a centered preview and their controls at the bottom: Scan for motion on the left; Download and Delete aligned on the right. The existing confirmation for deleting media remains required. Failed files remain clearly identified and never presented as playable.
- For user-requested USB recording or screenshots, the local server now attempts to release active preview processes for that camera before starting a separate FFmpeg capture. The frontend pauses and restores a USB preview around manual recording/snapshot actions; when recording is active, competing USB preview/snapshot actions are disabled or rejected. A failed device release prevents a recording request rather than silently claiming that capture succeeded. This is a compatibility measure, **not** proof of reliable dual-stream hardware capture. The manual recording workflow still requires Stop & save to finalize MP4.
- Tests: 582 Python cases, 151 JavaScript test files, deterministic preview termination, synthetic FFmpeg USB recording handoff, and DEMO browser smoke test; limitations and unverified hardware in `docs/RELEASE_0.2.189_TESTS.md`. Neither physical NexiGo capture nor Raspberry Pi hardware is available in the test environment. No claim of installation or GitHub push.

## OpenRF v0.2.188 — Surveillance overlays and clearer recording lifecycle (2026-11-24)

- Redesigned Surveillance camera tiles with video overlays for primary recording/stop, per-camera fullscreen, pause/resume preview, screenshot, camera history, digital zoom and optional USB V4L2 PTZ. Advanced motion actions remain in a collapsed panel. Camera fullscreen remains accessible from the tile; the separate grid fullscreen button is shown only when two live previews are requested.
- Improved preview reporting: distinguish preview requested, actual received frames and preview failure. The two-stream limit remains. Existing explicit manual recording/opt-in motion behavior is unchanged.
- Digital pan now uses edge-to-edge cover imagery with bounded drags to avoid revealing empty background; display cropping can hide parts of non-16:9 images. Digital zoom only changes the preview, never the saved video.
- Recordings history now includes **Stop & save** for active recording entries. MP4 playback/download becomes available only after a completed, nonempty recording. The UI explains that an active recording may be 0 bytes before finalization and no successful capture is implied by FFmpeg starting. Back-end process-exit verification rejects empty files and reports the actual stop outcome.
- Hardware constraints: some webcams cannot support simultaneous V4L2 preview and recording capture; pause the preview and retry if a capture fails. No physical NexiGo, Raspberry Pi, Windows installer or CI verification was performed for v0.2.188.
- Added v188 frontend and recording regression tests. Local Python and JS test outcomes are in `docs/RELEASE_0.2.188_TESTS.md`.

## OpenRF v0.2.187 — Compact Surveillance monitoring, per-camera history and opt-in USB PTZ (2026-11-24)

- Redesigned Surveillance Overview as a video-first wall: a spacious single-camera preview and compact two-column layout for multiple saved cameras, with a clear red Record/Stop button, fullscreen, Pause/Resume and History. Less-frequent snapshot, motion and zoom actions live in a collapsible Camera tools panel. Both fullscreen and the standard wall retain working controls; recording status labels distinguish a *requested* recording from verified media.
- Added per-camera filtering to Recordings and Motion & Events, plus a direct History button on every camera tile. Existing recordings, SQLite events, local credentials, startup page, map, messaging, navigation and Weather Hub are preserved.
- Added display-only digital zoom (1–3×), reset and drag-to-pan on compatible browser preview tiles; this does not change camera optics or saved video.
- Added optional explicitly requested V4L2 USB pan/tilt/zoom controls: `v4l2-ctl` detects supported min/max/step values from the saved `/dev/videoN` camera and executes a single clamped control change. A reported webcam control does not prove motorized PTZ. ONVIF/network-camera PTZ and portable camera pairing are **not** implemented.
- Tests: 577 Python cases in six non-overlapping passing groups, 149 JavaScript regression files, Chromium mocked-camera interaction, compile/syntax and release packaging checks. Hardware/PTZ, Raspberry Pi and GitHub CI remain unverified. See `docs/RELEASE_0.2.187_TESTS.md`.

## OpenRF v0.2.186 — Surveillance live-preview wall and fullscreen controls (2026-11-24)

- Surveillance Overview now displays one compact tile for every saved camera, with a real preview inside each tile. Entering Surveillance Overview requests up to **two** saved camera feeds automatically; any additional cameras show a clear paused state and can be started after pausing a feed. The main OpenRF Overview does not contact cameras, and switching Surveillance tabs or leaving Surveillance cancels the preview requests. Manually paused feeds stay paused for that visit and aren't silently restarted by refreshes. No recording starts automatically.
- Each camera tile keeps **View/Pause**, **Record/Stop recording**, **Screenshot**, **Motion clips** and **Full screen** actions together. The full-screen button changes to **Exit full screen**, including the whole-wall view; the individual fullscreen tile retains recording, screenshot and motion controls. Motion clips now has a concise explanation of its event-triggered behavior.
- Removed the duplicate camera-inventory and separate live-view sections from Surveillance Overview. Saved camera setup, test, rename, and removal controls remain under Cameras. New mobile/7-inch responsive tile styling, padding and status copy. USB previews are correctly identified as V4L2 rather than RTSP.
- Existing private SQLite/media paths, RTSP and USB capture APIs, opt-in recording/motion lifecycle, loopback-only API, messaging, mapping, navigation, Weather Hub and other pages are preserved. Preview status remains requested/frames-received/failed, never invented signal or camera telemetry.
- Added frontend regression coverage and exercised the DOM in headless Chromium with a **mocked API and images**. This is a software test only: no physical NexiGo, Raspberry Pi, Electron full-screen experience, or GitHub Actions was tested in this environment. See `docs/RELEASE_0.2.186_TESTS.md`.

## OpenRF v0.2.185 — USB picker, consent-based schedules, local motion notifications and camera icon (2026-11-24)

- Added automatic enumeration of Linux V4L2 video nodes and readable sysfs device labels for a dropdown in Surveillance → Cameras. Refresh/advanced manual path are available. Discovery does not contact, open or activate a camera; device presence does not establish video support. WSL USB passthrough and NexiGo hardware still require testing.
- Added separate padded Surveillance Schedules tab with local recurring weekday windows and private SQLite persistence. Schedules always start disarmed on OpenRF restart. Arming requires explicit confirmation in the UI, disarming stops only schedule-owned recordings, and window expiry stops scheduled clips. Failures do not expose camera URLs. At most 16 schedules, one per camera, max 2 concurrent recordings. No unattended restart or cloud service.
- Added opt-in local motion-candidate notifications: visible in-app activity and optional browser desktop notifications (requires permission). Off by default every UI session; notifications occur only for newly observed events while the app page is open. No person detection, background push or automatic uploads.
- Replaced the Surveillance navigation tile glyph with a camera-shaped line SVG, matched to other sidebar icons.
- Added Python/JS regressions for session-only schedule arming, window lifecycle, USB labels, new UI controls, sidebar glyph and API same-origin boundaries. See `docs/RELEASE_0.2.185_TESTS.md`. No camera or Raspberry Pi hardware was tested.

## OpenRF v0.2.184 — Opt-in live motion clips, Surveillance tabs, Overview startup (2026-11-24)

- Added a single, explicitly started real-camera FFmpeg grayscale motion monitor using user-selected low/medium/high thresholds. Frame changes (not person detection) may request local 20-second recordings; 30-second cooldown and 20-minute session limit. Monitor never reconnects/resumes after process restart; stopping the monitor also stops its owned clip. Saved events include evidence timestamps and actual media outcome, without exposing RTSP URLs.
- Added a user-confirmation step before monitoring plus end-session controls, same-origin local API validation, and camera edit/delete guards while monitoring. The UI requests stopping monitoring when leaving Surveillance or unloading; process has a hard session cap if the browser disappears. No background monitoring on startup.
- Reorganized Surveillance into padded Overview, Cameras, Recordings and Motion & Events tabs. Default initial app page is now **Overview**; a genuine browser refresh restores that tab's selected page. Map still opens on request.
- Added focused Python and JavaScript regression tests with fully synthetic camera frames. Hardware camera, USB exclusivity, CPU, Pi performance and ONVIF remain unverified; concurrent monitor and clip require the camera to support multiple stream readers.

## OpenRF v0.2.183 — Opt-in saved-video motion candidates and local event history (2026-11-24)

- Added explicit **Scan for motion** to completed, locally saved Surveillance videos. The backend uses installed FFmpeg to decode at most the first five minutes at 2 fps, 128×72 grayscale, then applies deterministic frame-change thresholds. Low/medium/high sensitivities and a six-second candidate cooldown are available. No live stream is opened, no automatic scan or recording is started, and synthetic footage is used only for tests.
- New private SQLite motion-scan receipts and event history record recording identity, approximate time offset, pixel-change fraction, sensitivity and scan timestamp. Zero-result scans are retained. Rescanning replaces that video's prior candidates; deleting only an analysis is explicit and does not remove the original media. If video is deleted or cleaned up, its historical events show **SOURCE VIDEO UNAVAILABLE**.
- Added a readable Motion review & event history panel and scan button on eligible recordings, with independently selectable sensitivity and manual removal of scan history. An observed frame change is **not person detection, an alert, proof of live motion, or a confidence estimate**.
- Added deterministic algorithm, input/error validation, source-availability, HTTP origin protection, persistence, FFmpeg synthetic-clip and frontend checks. No hardware cameras or Raspberry Pi were used. Full regression status: see `docs/RELEASE_0.2.183_TESTS.md`.
- Existing Surveillance previews/recordings, media retention, camera inventory, map, navigation, messaging and Weather Hub remain intact. ONVIF, continuous live motion, automatic event recording, scheduled recording, remote camera pairing and real-hardware performance are not implemented.

## OpenRF v0.2.182 — Explicit Surveillance history cleanup (2026-11-24)

- Added user-triggered retention review for local Surveillance recordings and snapshots by age (1–3650 days), reporting item count and bytes without deleting anything.
- Added explicit confirm-and-delete of exactly reviewed media IDs, with server-side rechecks to prevent deleting active/newer recordings after a stale preview. No background deletion or automatic storage pruning.
- Preserved local-only HTTP API, camera inventory, previews, screenshots and recording history. New Python/JavaScript tests cover validation, age filtering, live-recording exclusions and cross-origin rejection.
- Actual cameras, Raspberry Pi playback/USB drivers, ONVIF, automatic motion capture, battery telemetry and hotspot pairing remain unverified or unimplemented. See `docs/RELEASE_0.2.182_TESTS.md`.

## OpenRF v0.2.181 — Opt-in Surveillance recording, snapshots and USB video (2026-11-24)

- Added explicit Linux V4L2 USB camera inventory support, one-shot JPEG screenshots and bounded on-demand FFmpeg video recording to local H.264 MP4. Persistent private recording history, download, byte-range playback, deletion and disk-usage display.
- Preserved existing RTSP two-feed preview, opt-in connection diagnostics and local-only API. No auto-start or background scanning; camera credentials remain redacted from JSON.
- Recordings stored outside source/Git beside the existing local SQLite database. ONVIF, PTZ, motion detection, configurable retention and Bluetooth camera video remain unimplemented. Camera hardware is untested. **14 focused Python tests and 143 JavaScript suites passed; full Python suite timed out**. See `docs/RELEASE_0.2.181_TESTS.md`.

## OpenRF v0.2.180 — On-demand RTSP camera connection diagnostics (2026-11-24)

- Added manual video-stream check for saved Surveillance RTSP cameras, returning bounded, sanitized codec/resolution metadata or an explicit diagnostic failure. No automatic scanning or recording.
- Added single-probe concurrency control and tests, preserving the v0.2.179 two-camera monitoring wall.
- FFprobe is optional and real cameras/physical Raspberry Pi were not available for testing. See `docs/RELEASE_0.2.180_TESTS.md`.

## OpenRF v0.2.179 — Two-camera Surveillance live monitoring wall (2026-11-24)

- Surveillance now supports manually opening **two simultaneous live RTSP previews**, each with an independent Stop and full-screen action, plus a Stop all feeds control and optional full-wall fullscreen. Opening a third feed is blocked with a clear message. No camera automatically connects on inventory refresh.
- Closing Surveillance, navigating away from the application or removing a camera cancels its browser stream requests. Editing a camera's RTSP URL stops any previous preview before saving. Other existing OpenRF features and camera storage are preserved.
- Camera availability stays honest: NOT CHECKED for inactive cameras and REQUESTED for user-started previews; receiving video frames is separately labeled. No unsupported live telemetry, video recording or motion detection is claimed.
- No additional Python runtime dependencies. **No real RTSP camera or Raspberry Pi hardware was tested**. See `docs/RELEASE_0.2.179_TESTS.md`.

## OpenRF v0.2.178 — Surveillance inventory and user-started RTSP previews (2026-11-24)

- Added the separate **Surveillance** workspace with add/edit/rename/remove of real RTSP camera configurations in the existing private OpenRF SQLite database. No relation to ALPR/Flock camera map layers. Saved entries show **NOT CHECKED**; inventory refresh never opens a stream or discovers a camera.
- Added **View live** and **Stop viewing** controls for supported private IPv4 RTSP cameras with optional FFmpeg, transcoded into a local 2-fps MJPEG `<img>` preview, with at most two previews. No video is simulated; failure leaves a blank/error state. Navigating away drops the preview connection. Full-screen touchscreen view is available.
- Bound all endpoints to the existing local HTTP server, restrict preview to same-origin, reject public/localhost/link-local IPv4 source URLs, do not expose stored credentials via JSON, and keep all configurations outside Git. Plaintext RTSP URL credentials in SQLite and local process arguments remain a limitation; use dedicated, read-only camera credentials.
- **Not implemented in v0.2.178:** USB camera monitoring, ONVIF negotiation/discovery, multiple-camera streaming grid, recordings/playback, screenshots, storage retention, motion detection, PTZ, battery telemetry and portable Bluetooth/hotspot pairing. The Mesh Network Dashboard is the next development priority and not included in this patch.
- **544 Python tests and 141 JavaScript suites passed in local grouped regressions**, plus compilation and syntax checks. Source-level Python/API and JavaScript tests added. No physical camera, Raspberry Pi, ONVIF, Windows PowerShell updater, WSL networking or CI release push was tested. See `docs/RELEASE_0.2.178_TESTS.md`.

## OpenRF v0.2.170 — Sidebar, weather gateway reads and icon cleanup (2026-11-21)

- Reordered the left sidebar to **Overview → Messages → Map → Emergency → Analysis → Signal Viewer → Radio Receiver → Ham Radio → Sessions → Hardware → Web Browser → Weather Station → Trips & Maps → Saved**. Messages retains distinct Meshtastic, Reticulum and MeshCore subpages; App Settings remains in the footer. No default page, existing radio action or protocol data flow was changed.
- Added an **opt-in Ecowitt HTTP LAN adapter** using the manufacturer's read-only `GET /get_livedata_info` endpoint. One user button triggers one direct RFC1918-IPv4 request; preview does not save, whereas **Read once & save** stores gateway-reported values with gateway IP and OpenRF receipt UTC in the private local weather archive. Conservative unit conversion, bounded response, short timeout and redirect rejection prevent accidental internet requests, inferred rainfall intervals and blind hardware claims. No discovery, background polling, pairing, network listener or automatic sensor reads.
- Added **WeeWX archive CSV** import supporting US/METRIC/METRICWX conversions using official WeeWX unit definitions. It reads only the selected local file and tags resulting observations IMPORTED_HISTORICAL; no WeeWX service starts. Prior `weather_readings` records are preserved by transactional SQLite schema migration and now support source device provenance.
- Replaced four site/application icon PNG sizes using the supplied OpenRF tower icon with white corner/rim artifacts removed. The navy tile remains rounded; the four outside canvas corners are truly PNG-alpha transparent (not black or white). Desktop/PWA/Apple touch/favicon references remain stable.
- Added deterministic Ecowitt protocol, security, SQLite migration, HTTP endpoint, WeeWX conversion, sidebar ordering and icon dimensions/transparent-corner regression tests. Included a reusable Windows-compatible ZIP32 release builder and manifest/CRC/reserved-path checks. **497 Python tests and 138 JavaScript suites passed locally**, with Python compilation and JavaScript syntax checks. **Physical weather hardware, sensor validity, LAN connectivity under WSL and Raspberry Pi touchscreen rendering are not verified.** Details: `docs/RELEASE_0.2.170_TESTS.md`.

## OpenRF v0.2.169 — Hardware navigation and spacing polish (2026-11-21)

- Reorganized the existing **Hardware** page into **Dashboard / Radios & Networks / USB & Sensors / System** tabs, matching the established OpenRF messaging/Reticulum tab style. Moved original live DOM elements—never clones—so explicit radio/hotspot/USB actions, selected values, test results and event listeners are retained. Tabs switch without scrolling the page, changing network state, probing serial devices or starting background RF capture.
- Added 16px vertical separation between the two Ham Radio panels, adjacent Sessions panels, and Hardware tab cards including the previously touching External USB Sensor and Operating Environment areas (now placed on separate tabs).
- Added tab identity/keyboard navigation tests and a backend static asset check. Created a compatibility-focused ZIP32 Deflate release and documented download integrity checks for the reported Windows `Central Directory corrupt` error. The source v0.2.168 archive passed CRC checks locally; the user's `OpenRF-v0.2.168(1).zip` bytes were not available for inspection, so its exact failure cause is unverified.
- **482 Python tests and 137 JavaScript suites passed locally**, plus compilation and syntax checks. Remaining 7-inch Pi/WSL physical layout checks: `docs/RELEASE_0.2.169_TESTS.md`.

## OpenRF v0.2.168 — Offline weather station hub (2026-11-21)

- Added **Weather Station** sidebar workspace with touch-friendly **Dashboard / Stations & Sensors / History** tabs. Works on Linux/WSL/Pi without weather hardware or network services and retains the existing map, radio, messaging and emergency features.
- Added new local `WeatherStore` tables inside OpenRF's existing private SQLite database, isolated from RF observation provenance. Users can create named weather stations, enter explicitly sourced **MANUAL** measurements, and import up to 500 rows of bounded, timezone-aware **IMPORTED_HISTORICAL** CSV per action. All readings record source category, station identity, UTC observation/record times, and SI-unit values. Reject missing/invalid data and duplicate UTC-second/source readings rather than inventing sensor values.
- Added local read-only history APIs, filterable chronological chart and table, conversion to familiar U.S. display units, and CSV export capped at the latest 50,000 station readings. No account, service listening on LAN, internet collection, sensor discovery, automatic connect, uploads or radio transmissions are introduced.
- Added Python storage/API and JavaScript navigation/entry regression suites plus Linux CI syntax check. **482 Python tests and 136 JavaScript suites passed locally**; Python compileall and JavaScript syntax checks passed. **Automatic Ecowitt, WeeWX, rtl_433 and ESP32 sensor adapters remain planned, not implemented or hardware-verified.** Test results and manual checks: `docs/RELEASE_0.2.168_TESTS.md`.

## OpenRF v0.2.167 — Unified messaging navigation (2026-11-21)

- Renamed the former **Mesh messages** sidebar/header/page labels to **Meshtastic** so it cannot be confused with the independent **MeshCore** integration. Existing routes, IDs, API endpoints, saved message data and protocols are preserved.
- Added the same **Dashboard / Inbox / Contacts** tab layout to Meshtastic and MeshCore as Reticulum's navigation: radio status/manual USB controls under Dashboard, chronological conversation controls under Inbox, and real protocol-specific contact lists under Contacts. Meshtastic's existing saved-node/nickname directory opens as a contact tab; MeshCore's directory is populated from Companion radio contacts and routes a selected contact to its chat. The original DOM forms are moved, not recreated, preserving event listeners and drafts.
- Kept **Files** only where supported (Reticulum Resource transfers). Added accessible tab keyboard navigation, Inbox unread badges, touch-friendly styles, and automated DOM/markup tests. No protocol forwarding, background connections, new file transfer support or inferred online status was added.
- **471 Python tests and 135 JavaScript suites passed locally**, along with Python compilation and JavaScript syntax checks. Live radios, WSL USB passthrough and Raspberry Pi touchscreen remain unverified. See `docs/RELEASE_0.2.167_TESTS.md`.

## OpenRF v0.2.166 — MeshCore Companion radio messaging foundation (2026-11-21)

- Added independent **Messages → MeshCore** workspace, touchscreen-ready USB controls, actual radio contact list, read-only unknown-sender threads, and direct radio text composition. Chronological conversation bubbles open at the newest and follow new messages only if already near the bottom. Header/sidebar unread count integrates without merging Meshtastic, MeshCore or Reticulum conversations.
- Added optional official MeshCore `meshcore` Python SDK adapter in a dedicated asyncio loop. Explicit user action is required for serial Connect, Refresh contacts, Disconnect or Send; read-only inventory never opens an unknown port. Server process keeps no persistent MeshCore text history; up to 200 messages live in memory. No auto-advertisement, broadcasts, forwarding, location sharing or simulated transmissions.
- Outgoing message receipts are matched by the SDK's `expected_ack` field to an actual ACK event. Radio submission is **not** a network ACK or recipient-read receipt. Errors and disconnected links do not become successes. Added synchronized mutual USB port-claim checks against Meshtastic and configured Reticulum RNodes and included MeshCore ownership in the read-only connections report.
- Added deterministic Python fake-Companion, async SDK-shaped event-loop, API conflict and JavaScript inbox regression tests. **471 Python tests and 134 JavaScript suites passed locally.** No live MeshCore physical radio, WSL USB passthrough, Pi display or over-the-air success was verified. See `docs/RELEASE_0.2.166_TESTS.md`.

## OpenRF v0.2.165 — Reticulum chat chronology and delivery receipt callbacks (2026-11-21)

- Reticulum and Meshtastic conversation bubbles now follow actual UTC chronology from oldest at the top to newest at the bottom, even when local history rows were inserted after an older message. Entering a Reticulum thread, selecting the Inbox tab or opening Mesh messages moves the conversation to the latest message; automatic polls follow only when near the bottom, preserving a manually scrolled position.
- Outgoing LXMF messages now register explicit delivery/failure callbacks before queue submission, update their exact in-memory record by event ID, and preserve confirmed statuses in opt-in SQLite history. The UI distinguishes **Queued (unconfirmed)**, **Delivered (LXMF receipt)**, and **Delivery failed**. The Send status near the composer updates when a matching receipt arrives. HTTP 202 remains local request acceptance only.
- A separate MeshCore integration plan documents the optional future USB serial companion-radio backend and explains that Meshtastic, MeshCore and Reticulum/RNode are distinct firmware/network transports. No hardware driver or automatic inter-network bridging was added. Existing v0.2.164 queued records remain unverified unless a new tracked send receives its own callback.
- Added regression tests for oldest-to-newest ordering, scroll-follow semantics, callback isolation and persisted status transitions. **463 Python tests and 133 JavaScript test files passed.** No physical Reticulum delivery, RF radio, Pi device or MeshCore companion was available for a live test. See `docs/RELEASE_0.2.165_TESTS.md`.

## OpenRF v0.2.164 — Reticulum Dashboard consolidation and stamp-worker/send feedback fix (2026-11-21)

- Removed the separate Connections tab. Dashboard now groups optional LAN/TCP, HaLow, RNode, and diagnostics in collapsed sections while preserving existing inputs and listeners. Reticulum still requires explicit Enable; all transport opt-ins retain their default-off values.
- Fixed the observed Python `AssertionError: daemonic processes are not allowed to have children` during `RNS.Stamps.job_linux_managed` path requests. The owned Reticulum worker is no longer daemonic, allowing RNS to create its own stamp helpers. The normal Stop, server shutdown, termination and reaping paths remain in place.
- Moved send feedback into the visible Inbox composer. Distinguish path-discovery `PATH_REQUESTED_NOT_SENT`, LXMF acceptance `QUEUED_WITH_LXMF_NOT_DELIVERED`, unknown identity and request failures. HTTP 202 is not a delivery acknowledgement.
- Missing optional package/startup diagnostics name the active Python executable. Added nested subprocess regression tests and adjusted four-tab UI tests. **460 Python tests and 132 JavaScript test files passed.** No radio hardware, real LXMF peer delivery, Bluetooth link, Pi installer, or live resource receipt was tested in this environment. See `docs/RELEASE_0.2.164_TESTS.md`.

## OpenRF v0.2.163 — Reticulum tab service fix and cleaner Inbox (2026-11-21)

- Fixed the root cause of v0.2.162's nonresponsive Reticulum tabs: the backend served the HTML but omitted `/static/reticulum-tabs.js` from its explicit allowlist, returning HTTP 404. Added that script and the also-previously-missing `/static/camera_alerts.js` to the static route allowlist.
- Reticulum now opens a five-tab layout in the order **Dashboard, Inbox, Contacts, Connections, Files**. Separate Contacts and message-history controls from the message list, and keep Bluetooth Classic and Reticulum Resource transfer panels together under Files. Clicking a contact's Message action now opens Inbox; saving a new recipient opens Contacts. Preserve original DOM event listeners, explicit network consent, current drafts, and no automatic tab-scroll behavior.
- New loopback HTTP regression test discovers and requests every JavaScript file referenced by the main HTML to catch missing allowlist entries. Existing DOM-mock tests verify tab selection, preservation, unread badges, keyboard navigation and contact routing. **458 Python tests and 132 JavaScript test files passed.** No new dependencies, SQLite migrations, backend radio features or LXST calling support. See `docs/RELEASE_0.2.163_TESTS.md`.

## OpenRF v0.2.162 — Inbox-first Reticulum tabs (2026-11-21)

- Reorganized the Reticulum workspace into four responsive, keyboard-accessible tabs: **Inbox (default)**, **Dashboard**, **Connections** and **Files**. The message thread list, composer, contacts and optional private history are accessible without scrolling through TCP, HaLow and RNode configuration. The inbox tab shows an unread count when applicable.
- Moved the existing live form/message/file-transfer DOM nodes into tab panels, preserving IDs, event listeners and unsent drafts rather than cloning or replacing them. Dashboard includes shortcuts to the other tabs. Buttons update tab selection in place with no link/hash navigation, focus jump or forced page scrolling. Existing transfer actions still require explicit consent.
- Per request, skipped LXST and real-time calls entirely; no dependency, new network endpoint, microphone permission or auto-transmit behavior. Added deterministic JavaScript layout/tab regression coverage. **457 Python tests and 132 JavaScript suites passed.** Headless Chromium could not launch under the test environment's process socket restrictions, so live layout and hardware remain unverified. See `docs/RELEASE_0.2.162_TESTS.md`.

## OpenRF v0.2.161 — Consent-based Bluetooth Classic peer file sharing (2026-11-20)

- Added a **Nearby Bluetooth file sharing** section at the top of Messages → Reticulum, independent of enabling Reticulum. A trusted, paired Linux Bluetooth Classic device can explicitly receive one file for five minutes or send one file up to **2 MiB** on fixed OpenRF RFCOMM channel 22. The exact sender MAC must match the manually armed receiver. The UI requires separate confirmation for receiving and sending; opening the page does not scan or listen.
- Implemented authenticated/encrypted RFCOMM security enforcement, bounded filename/header/content parsing, SHA-256 validation and a final receiver acknowledgement, one active operation, progress, cancellation, explicit received-file download/discard and no persistence of incoming bytes in SQLite. Capability errors distinguish unsupported WSL/Python/BlueZ hardware from a real connected peer. This private protocol is not OBEX or Bluetooth LE file exchange.
- Added opt-in loopback HTTP endpoints and a separate frontend controller, 8 Python tests (including a two-peer fake-socket transfer with checksum acknowledgement and refused wrong peers), and 1 JavaScript UI consent test. **457 Python tests and 131 JavaScript suites passed.** No new required Python library, automatic radio operation, new database migration or physical Bluetooth/speaker/mic test. See `docs/BLUETOOTH_FILE_SHARING.md` and `docs/RELEASE_0.2.161_TESTS.md`.

## OpenRF v0.2.160 — Explicit short LXMF voice notes (Phase 2) (2026-11-20)

- Added **Record / Stop / Discard voice note** controls to Reticulum message composition. A local 20-second timed browser `MediaRecorder` captures only following explicit user action and browser permission; an audio preview appears before the existing, separately confirmed **Send** action. Thread changes, discard, lost focus and recording errors stop the microphone without sending.
- Supports locally produced WebM/Ogg/MP4 audio as a single bounded **128 KiB** LXMF file attachment, with received-attachment MIME determined from bytes and a manual audio player. Audio never autoplays; oversized or empty recordings cannot be sent. Different remote peers may not support every codec; transport and playback remain subject to hardware and LXMF limitations.
- Scoped Electron native microphone permission to the trusted local page and a short user-armed window, keeping external embedded websites and video capture denied. Added browser-mock voice flow, MIME, attachment and HTTP tests. No SQLite migration, mandatory Python dependency, automatic RF traffic, real-time calling, Bluetooth protocol or verified radio peer added. See `docs/RELEASE_0.2.160_TESTS.md`.

## OpenRF v0.2.159 — Peer Resource file transfers (Phase 1B) (2026-11-20)

- Added a separate `openrf.files` Reticulum Resource destination with its own shareable/announced 32-character file address, distinct from LXMF chat. Two OpenRF v0.2.159 peers can explicitly send one file up to 2 MiB over an established RNS Link, with live reported progress, a cancel action and SHA-256 verification on receipt. Existing 128 KiB LXMF chat attachments are unchanged.
- Receiver consent is OFF by default: users deliberately arm **one** incoming file for up to five minutes. Rejects unexpected Resource advertisements, oversized offers and invalid metadata; received content has a bounded session-only memory store and an explicit download button. No automatic permanent OpenRF file saving, camera/microphone, background network listener beyond the previously explicitly enabled Reticulum transport, or Wi-Fi scanning.
- Added `/api/reticulum/files/*` loopback endpoints, a collapsible Peer file transfer section in Reticulum, and tests for authorization, bounds, checksum, cancellation and HTTP. Resource callback integration is simulated; actual Linux/Pi/RNode peer interoperability, transfer speed, timeout and radio airtime remain unverified. This is not Meshtastic file sending, unlimited rncp or voice chat.

## OpenRF v0.2.158 — LXMF small photo and file attachments (2026-11-20)

- Added a direct, explicit one-file attachment picker and local photo preview to Reticulum conversations. PNG/JPEG/WebP payloads send using the native LXMF `FIELD_IMAGE`; small PDFs and other files use `FIELD_FILE_ATTACHMENTS`, matching Sideband's published field format. Files are capped at 128 KiB for this initial direct-LXMF transport path.
- Added bounded, ephemeral receive/send attachment storage in the optional Reticulum worker, safe download and image thumbnail endpoints, MIME sniffing, path-safe filename validation, and session-expired indication. Incoming file bytes are never persisted automatically; optional SQLite history stores filename/size metadata only. Old history databases migrate by adding optional columns without deleting contacts/messages.
- Added mock LXMF peer, HTTP download, metadata migration and frontend regression tests. Verified source behavior without actual radio hardware or end-to-end peer delivery. No Meshtastic file transfer, general RNS.Resource transfer, voice memo or real-time calling yet.

## OpenRF v0.2.157 — Linux Debian installers and opt-in Pi kiosk (2026-11-20)

- Added pinned Electron 45.4.1 / electron-builder 26.18.1 Debian build workflow with packaged OpenRF server resources, desktop integration, Python runtime dependency, and shared-library dependencies. Packages are separate for amd64 Linux and ARM64 Raspberry Pi OS; Node/npm are build-only dependencies.
- Added `pi-startup.py enable|disable|status` for Raspberry Pi OS labwc desktop autostart, scoped to one preserved managed stanza and never run at installation. Installed launcher responds to `--openrf-kiosk`. No root login, system service, background RF scan, altered database, or network listener exposure.
- Added startup safety and package configuration tests and a Pi setup/runbook. Actual Pi OS install, GPS/GPU, power and touchscreen startup must still be tested on hardware. Project license and public maintainer URL/email must be finalized before public distribution.

## OpenRF v0.2.156 — sidebar map icon compatibility (2026-11-20)

- Replaced the Map sidebar's missing-glyph Unicode character (`⌖`) with an inline folded-map SVG, sized and colored consistently with the existing sidebar Emergency SVG icon. This fixes the rectangle rendered on the user's Linux Electron laptop without adding an icon font dependency.
- Added a regression test that checks the SVG icon and color inheritance. No backend, database, hardware, browsing or mapping logic changes. See `docs/RELEASE_0.2.156_TESTS.md`.

## OpenRF v0.2.155 — native browser backgrounding and shell measurements (2026-11-20)

- Kept the Electron `WebContentsView` experience inside OpenRF. Inactive websites are now explicitly hidden with `View.setVisible(false)` and preserve Chromium background throttling while retaining live DOM/navigation state for fast tab switching. No external Chromium kiosk is introduced or required.
- Added a single-instance Electron lock: duplicate shell launches focus the existing window, helping avoid competing backends and duplicate Chromium process trees. A crashed external renderer now surfaces a reload/close status; it cannot crash the main OpenRF Python application by itself.
- Added an Electron-only App Settings card for **on-demand**, local process working-set (approximate), available system memory, loaded browser-tab and Chromium process counts, and CPU interval samples. Never sends readings off-device or opens a website. Working-set sums may double-count shared pages and exclude Python/OS memory; Pi RAM, power and thermal behavior are not yet hardware-verified.
- Added test coverage for resource reporting, hidden live tab behavior, single-instance code contract and native-only UI. No new Python/Node runtime dependencies, API endpoints, SQLite migrations, RF measurements, map source changes or automatic scanning. See `docs/RELEASE_0.2.155_TESTS.md`.

## OpenRF v0.2.154 — continuous raster panning and manual location diagnostics (2026-11-20)

- Corrected Web Mercator wrap in the no-WebGL renderer: independent tile image nodes are now keyed by unwrapped world column, while the requested XYZ address wraps. The camera clamps vertical panning at polar bounds so wide, zoomed-out maps do not reveal avoidable coordinate-grid gaps.
- The fallback explanation and layer-picker disappear after real raster imagery loads; offline and online imagery remain selectable under Map → Layers, and failed tile retries remain available before successful display.
- Added visible map recenter progress/error feedback; Electron skips the automatic browser location request and makes location a deliberate map recenter action. Without a configured Electron browser provider it checks the already-supported local gpsd adapter directly; otherwise browser failure may fall back to a one-shot GNSS check with separate consent header and strict fresh/accuracy checks. No GNSS receiver or desktop geolocation service is assumed, no automatic tracking or storage added. WSL Firefox remains the easy location-enabled development path.
- Added raster panning/projection and consent/quality tests. No SQLite change, new Python dependency, installed OS driver, RF hardware behavior or map pack mutation. See `docs/RELEASE_0.2.154_TESTS.md`.

## OpenRF v0.2.153 — Electron desktop map recovery and sidebar sizing (2026-11-20)

- Fixed inherited 18px desktop sidebar label sizing, preventing Signal Viewer and Radio Receiver from wrapping at a 1280×800 Linux Electron window. Kept navigation tap targets and the App Settings typography consistent.
- Added an explicit no-WebGL USGS Topographic / Satellite raster path using ordinary image elements, with the original local MBTiles and coordinate-grid fallback still available. Basemap selection survives startup/context failures and works within raster mode without reattempting the failing MapLibre context. Repeated selection retries failed tiles, and failed requests are labeled.
- Kept Default/Offline mode free of new remote tile requests and preserved USGS attribution. Regional offline **vector** MBTiles still need hardware/software WebGL; this update does not claim to fix Linux WSL graphics drivers or deliver offline topo raster data automatically.
- Added targeted regression checks and maintained all Python/JavaScript integration tests. No database migration, hardware assumptions, new required package or RF sensor changes. See `docs/RELEASE_0.2.153_TESTS.md`.

## OpenRF v0.2.152 — Wi-Fi quick connect and Linux desktop launcher groundwork (2026-11-20)

- Added a compact Wi-Fi button alongside Emergency and Messages in the top-right header. A bounded dropdown offers read-only Linux Wi-Fi status, explicit NetworkManager scan, named nearby networks with approximate quality/security, and a separate confirmation step to join an open or WPA-personal network. No background scanning, guessed networks, extra location collection or RF survey saving. Unsupported WSL/no-NetworkManager conditions are labeled honestly.
- Added backend `/api/network/wifi/status`, `/api/network/wifi/scan` and `/api/network/wifi/connect` endpoints with loopback/origin checks, an additional user-action header for POST, serialized Wi-Fi actions, validated SSIDs/passwords, and secret-free result/error payloads. Passwords are passed to `nmcli --ask` on stdin, not CLI arguments, logs or OpenRF storage. Actual Pi NetworkManager/polkit behaviors still need hardware testing.
- Electron native shell can now start and stop its **owned** OpenRF Python backend, or attach to an already running matching local version without terminating it. Added explicit SIGTERM-to-graceful-shutdown handling. Added `electron-builder` `.deb` metadata and `x64`/`arm64` build scripts. **No prebuilt Electron binary or tested `.deb` is shipped** with this source ZIP; final installer dependencies and ARM64 behavior remain outstanding.
- Added backend mocked-NetworkManager, HTTP consent and frontend quick-access tests plus optional shell lifecycle tests. No change to RF measurement semantics or database migrations. See `docs/RELEASE_0.2.152_TESTS.md`.

## OpenRF v0.2.151 — Live browser tabs, Pi Chromium shell and offline trip map catalog (2026-11-20)

- Fixed the browser tab-switching regression: each open tab now retains its own live isolated HTTPS preview while switching tabs or OpenRF pages. Closed tabs release their frames; an app restart restores the tab addresses but never silently loads external websites.
- Replaced the browser's Unicode Back, Forward, Refresh and Home symbols with consistent local Font Awesome Free 6.7.2 solid SVG icons, with accessible button names and no online font dependency.
- Added an optional Chromium-based Electron shell using secured WebContentsViews for full websites inside the OpenRF Browser page. Remote content has separate in-memory sessions, blocked local addresses, denied device permissions, no Node/preload access, denied pop-ups and blocked downloads. Live native tab views remain mounted during tab switching. This is source/integration work; Electron installation and Raspberry Pi touchscreen/GPU execution are **not hardware-verified**. Standard WSL/browser operation has no new runtime dependency. See `docs/NATIVE_BROWSER_PI.md`.
- Added **Trips & Maps** to the sidebar, with bounded local-only inventory of raster packages, declared type/source/coverage, size, zoom, saved area plan list, map activation and double-confirmed individual removal. The active map cannot be removed from the new UI; old Map settings controls remain. Classifications derive from local metadata and do not certify tile coverage or routes. Uses the existing `/api/maps` storage and DELETE safeguards plus a new read-only `/api/maps/catalog` endpoint.
- Added backend catalog/classification tests, browser tab retention, native shell security/IPC/geometry contract checks and frontend inventory/filter/removal tests. No new Python package, SQLite schema migration, automatic network contact or private data upload. See `docs/RELEASE_0.2.151_TESTS.md`.

## OpenRF v0.2.150 — Optional web browser workspace (2026-11-20)

- Added a **Web Browser** sidebar page with a compact 7-inch-friendly tab strip, website/search field, entered-address navigation, bookmarks, an honest network-status label and a normal **Full browser** link. Tabs and bookmarks persist locally (bounded to 8 and 24 respectively). Restored tabs never automatically contact third-party sites.
- Added an opt-in sandboxed HTTPS preview with no same-origin or top-navigation grant and no referrer. Framing is best-effort; many sites refuse it and require opening the separate full browser. Only publicly named HTTP(S) sites can be entered; schemes, credentials, local names and numeric hosts are blocked. OpenRF does not provide an HTML proxy, external page API, silent download manager or Pi-native browser engine in this release.
- Extended the loopback server's static-file allowlist and Content Security Policy for HTTPS frames while preserving its Host check, X-Frame-Options DENY and other existing controls. Added Node interaction/security tests and loopback HTTP header/access tests. See `docs/RELEASE_0.2.150_TESTS.md`; no schema migration or new required Python dependency.

## OpenRF v0.2.149 — Trip-specific offline topographic and satellite map packs (2026-11-20)

- Added a compact **Download map for this trip** section directly beneath local walking/driving directions. Operators can select USGS topo or satellite imagery, a 0.5/1/2-mile corridor on each side and zoom 9–11, 9–12 or 9–13. Preview estimates actual candidate XYZ tiles along the sampled route (not an entire rectangular bounding box), an illustrative download size, and source/corridor details. It is read-only, local-only and never requests live GPS or external imagery until explicit consent.
- Added a bounded, private, atomic trip-MBTiles download with fixed approved USGS service hosts, no redirects, explicit separate confirmation, protected filename, unique tile keys, 384-tile cap, 128 MiB cap, 300-second budget, cancellation, status and safety-first complete-only publication. Missing/failing tiles leave no installed package. Completed maps appear in the existing offline raster inventory; attribution is preserved.
- Added a preview token so changed route/source/detail options require a fresh estimate before network contact. No private route history or raw coordinates are saved; the job status contains only package name, source, preview identifier and counts. Road/trail graphs, navigation GPS, live RF hardware, numeric terrain and route safety are not prepared by this raster step.
- Included backend geometry, download/atomic-failure, bounded transport, preview/HTTP-security tests and frontend consent/preview/progress/route-reset tests. No DB schema migration or new required Python library. See `docs/RELEASE_0.2.149_TESTS.md`.

## OpenRF v0.2.148 — Local route coverage samples and SOS radio-send discoverability (2026-11-20)

- Added a map-directions **Offline tiles along this route** panel for both local walking and driving routes. It samples 13 evenly spaced selected-route points and probes actual installed regional vector tiles and private raster MBTiles packages at an appropriate zoom. Each basemap's available sample count is reported separately; samples are never pooled into a false complete map claim. The local POST endpoint refuses unrelated fields, malformed coordinates, excess sample points, untrusted hosts and any online flag. Checks don't fetch tiles externally, persist coordinates, start GNSS or alter maps.
- Preserved the last explicitly selected **Default/Satellite/Topographic** basemap using browser-local storage. Restored online USGS styles can request imagery for the viewed area on app reopening; blocked/private storage falls back safely to Default. Manual map-style, vector-source and raster-mode switches reset the remembered basemap to Default.
- Explained that a saved SOS draft **is not sent**. Added **Save & prepare radio send**, which saves locally, loads the draft into the existing manual Meshtastic/Reticulum radio handoff, and focuses the specific-recipient field. Transmission still requires supported connected equipment and an explicit confirmation; a send attempt, if requested, is not a 911 dispatch or guaranteed recipient delivery. The pre-existing offline outbox/attempt history remain intact.
- No database migration or additional Python dependency. See `docs/RELEASE_0.2.148_TESTS.md` for verified tests, limits and next steps.

## OpenRF v0.2.147 — Standalone application settings and honest field readiness (2026-11-20)

- Added **App Settings** in the permanent sidebar footer and compact navigation drawer, separate from Map Settings, with normal page title/visibility/session behavior. Added an accessible, full-width Settings workspace.
- Added a lightweight read-only `/api/device/storage` endpoint, sharing the existing Linux disk usage logic with Emergency device diagnostics. Reports free, used and total bytes for the filesystem containing OpenRF local data. Never infers a separate Pi drive while WSL uses Windows storage. Includes low-space warnings, unknown states and local-only HTTP safeguards; no recursive user-file scans, cleanup, or stored telemetry.
- Added a visually compact storage meter and manual **Offline field readiness** checklist for local Valhalla reachability, installed offline vector/raster maps, imported HGT tiles, battery gauge, free storage and untested GPS/route coverage. Reuses the existing offline-navigation/power/map APIs and does not start GPS, touch RF hardware or contact an external service. Local availability is labeled *reported*, never a certified trip-ready verdict.
- Added backend storage bounds/unknown/loopback HTTP tests and frontend markup, gauge, navigation and consent-safe preflight tests. **409 Python tests and 113 JavaScript test scripts passed**, plus JS syntax checks. No DB schema migration or required packages. See `docs/RELEASE_0.2.147_TESTS.md` for verification and next priority.

## OpenRF v0.2.146 — Map altitude overlay and responsive sidebar close (2026-11-20)

- Moved the one existing, accuracy-guarded GPS ALTITUDE badge out of the map header into the map viewport. It floats above the lower-right settings/add/layers row, clear of the left-side credits and survey legend. Clock, battery and Emergency stay in the header. The existing altitude controller, UTC freshness handling, vertical accuracy, GPS source labels and unknown value behavior remain intact.
- Hid the sidebar's nonfunctional X when the sidebar is always open, including 1280×800 with a fine pointer. Retained the close button only at the exact CSS/JavaScript compact-drawer breakpoints (≤900px or short 901–1400px coarse-pointer devices). No JavaScript routing or drawer event handlers changed.
- Added a release-specific layout contract covering badge parent placement, tooltip pointer access, desktop X visibility and compact drawer X preservation. **406 Python tests and 112 JavaScript test scripts passed**, including both syntax checks. No SQLite migration or new external dependency. See `docs/RELEASE_0.2.146_TESTS.md` for test results and limits.

## OpenRF v0.2.145 — Emergency quick actions, reliable raster status, battery and offline HGT route elevations (2026-11-20)

- Moved the four Emergency Dashboard **Quick access** actions directly below its five tab buttons so SOS, check-in, handoff and device readiness are visible immediately, without scrolling. All original events, focus targets and safe draft-only behavior are retained.
- Corrected false “Map tiles not visible” warnings in satellite/topographic mode: MapLibre's `isSourceLoaded` is false while individual tiles remain pending even though imagery is visibly present. Track actual raster content and relevant source failures; a pending tile alone is not an error. Preserve normal vector-map fallback diagnostics.
- Added a 44px Linux read-only battery indicator near the clock. It consumes an opt-in-hardware-compatible `/api/device/power` snapshot from the standard Linux power-supply sysfs interface. Real percentages, charging/low states, and genuinely missing/unusable readings are distinct; no fake battery, runtime or UPS support is presented.
- Added private, explicitly user-imported SRTM-compatible HGT 1° DEM tiles, direct bilinear sampled modeled heights, native offline walking/driving route elevation profiles and a simple install/list/remove UI. Only raw 1201×1201 or 3601×3601 16-bit data is accepted, with validated tile names, atomic protected installation, 32-tile limit, duplicate and symlink rejection, source labeling and no automatic external access. Missing or void samples remain gaps; imported provenance and grade safety are never claimed verified. Existing cached USGS profiles remain preferred.
- Added focused offline sampling, atomic import/security, HTTP privacy and battery-report tests plus JavaScript tests for the warning, header indicator, HGT controls and emergency shortcut placement. **406 Python tests and 111 JavaScript test scripts passed**. No SQLite migration, extra library, remote sensor claim or map-license changes. See `docs/RELEASE_0.2.145_TESTS.md` for remaining field checks.

## OpenRF v0.2.144 — Offline USGS topo regions, route terrain profiles and desktop UI (2026-11-20)

- Adjusted the map ALTITUDE card to the clock's 44px height, with two lines only. Rejected browser-supplied altitude without reasonable vertical uncertainty, including the misleading 0 ft seen on a WSL/desktop setup. Genuine local gpsd 3D readings remain accepted and accuracy/source details remain in the status tooltip. The indicator reports device GNSS height, not the ground contour at the map pin.
- Hide the top-right map hamburger whenever the left sidebar is already displayed, including 1280×800 with a fine pointer; preserve its visibility at the actual drawer/handheld breakpoints.
- Added a strictly bounded, explicitly confirmed USGS Topographic download for a saved map area: ≤96 tiles, ≤64 MiB payload, ≤150 seconds, background progress/cancel, no arbitrary URL input, HTTPS host fixed, no overwrite or incomplete published MBTiles. Support correctly attributed mixed JPEG/PNG local MBTiles tiles by recognizing each tile's actual MIME type. Offline packages use the existing private raster selector; the live Topographic style remains online and offline raster imagery alone supplies no numeric terrain data.
- Added opt-in USGS 3DEP terrain-height sampling and a compact SVG elevation chart in both walking/driving directions. The operator must approve sending 13 sampled planned-route coordinates to USGS; results are cached outside Git in a bounded local file keyed by route hash and may then be reused offline for that route. Display incomplete coverage honestly. No background GPS tracking or automatic coordinate upload.
- Added atomic downloader/profile/cache/API tests, browser UX contract tests, updated asset allowlist and release cache keys. **398 Python tests and 110 JavaScript test scripts passed**. No new required Python library or SQLite schema. Field GNSS, actual USGS availability/quotas, full-height screenshot, routing hardware and Pi touch behavior require operator verification. See `docs/RELEASE_0.2.144_TESTS.md`.

## OpenRF v0.2.143 — Selectable satellite/topographic maps and GPS altitude (2026-11-20)

- Added a three-way base-map picker at the top of the existing Map → Layers sheet: **Default** (existing offline-aware OpenRF vector style), **Satellite** (USGS The National Map Imagery Only) and **Topographic** (USGS Topo with contours/relief). Only explicit satellite/topographic selection contacts USGS; these layers are online U.S.-focused and do not silently become offline packages. Returning to Default restores the existing light/dark palette and selected offline-vector preference. Satellite/topographic map sources and attribution use narrowly approved service URLs and CSP permissions.
- Added a compact map-header **ALTITUDE** status between the clock and Emergency shortcut. Shows feet from fresh browser-reported altitude, a local gpsd 3D fix while already following a route, or the existing opt-in GPS track recorder. The interface distinguishes reported MSL versus ellipsoid references and shows receiver-provided vertical uncertainty; unknown and stale readings display **— ft**. It does not infer height from coordinates, download a terrain model, or request additional GPS permissions.
- Preserved privacy: no automatic external imagery requests, tile requests reveal only the viewed map region, and no GPS/RF records are sent to the USGS service. The default installed regional vector map remains available offline. Added backend MapLibre style/HTTP tests, GNSS altitude-source tests, frontend style-choice and stale-altitude tests. **389 Python tests and 109 JavaScript test scripts passed.** See `docs/RELEASE_0.2.143_TESTS.md`.

## OpenRF v0.2.142 — Emergency tab switching without viewport jumps (2026-11-19)

- Removed an unconditional `scrollIntoView` call from Emergency tab activation. Changing among Dashboard, SOS & Check-ins, Radio & Messages, Plans & References, and Backup & Data no longer deliberately moves the document to the tab row.
- Kept keyboard focus on the selected tab with `preventScroll`, and preserved the explicit jump to a specific field when using Dashboard quick-access shortcuts (as opposed to ordinary tab switching).
- Added a JavaScript regression that simulates a scrolled page and asserts click, keyboard, programmatic, and return-to-Dashboard tab changes leave that position alone. **386 Python tests and 108 JavaScript test scripts passed.** No changes to emergency data, send safety gates or offline behavior. See `docs/RELEASE_0.2.142_TESTS.md`.

## OpenRF v0.2.141 — Emergency tabs functional, dashboard order and clean tab buttons (2026-11-19)

- Fixed the root cause of **nonfunctional Emergency tabs in v0.2.140**: the local server's explicit static JavaScript allowlist omitted `emergency-tabs.js`. The script received HTTP 404, so the tab buttons rendered but the original full Emergency page—including Encrypted emergency data backup—never got reorganized. Added the file to the narrow allowlist and covered actual same-origin GETs in server tests.
- The same allowlist had also omitted `breadcrumb_follow.js`, silently blocking v0.2.140's GPS-assisted historical reverse-track follow. Both new scripts now serve normally; unrelated arbitrary JS paths remain denied.
- Removed the extra enclosing tray/card around the five Emergency tab buttons. Kept the individual large teal buttons, active state, keyboard tab behavior and responsive 1280×800/narrow layout.
- Made **Emergency operations dashboard** the first Dashboard card, **Device survival & departure checks** the second, and private quick shortcuts immediately afterward. SOS/Family check-ins, Radio/Messages, Plans/References and Backups remain separately selectable to avoid a long one-page emergency scroll. Relabeled the last tab **Backup & Data** to match its content. Original forms and saved records are retained; no automatic SOS or radio send.
- Added a server regression that requests both versioned JS resources and verifies HTTP 200/content, plus a negative 404 path. Improved tab ordering and tray-less layout tests; **386 Python tests and 108 JavaScript test scripts passed**. Actual Firefox touchscreen visual testing and physical GNSS/Valhalla remain operator checks. See `docs/RELEASE_0.2.141_TESTS.md`.

## OpenRF v0.2.140 — Emergency workspace tabs and real GPS backtrack reference (2026-11-19)

- Reorganized the overcrowded Emergency page into five accessible, keyboard-operable tabs: **Dashboard**, **SOS & Check-ins**, **Radio & Messages**, **Plans & References**, and **Device & Backup**. The official-emergency-channel warning remains visible above all tabs. The Dashboard opens first with its existing local status cards and new one-tap shortcuts to SOS drafts, check-ins, radio handoff and device readiness. Tabs relocate the **original DOM panels**, preserving forms, IDs, handlers, saved data and explicit-send safety gates. The tab bar stays available while scrolling and collapses to horizontal swipe on narrow displays.
- Completed an explicitly opted-in **Follow reverse track (GPS)** mode for saved walking **and** driving breadcrumbs. After a fresh browser fix, it displays a live blue position marker over the reverse historical line, approximate distance along that line back to its original start, and GPS accuracy/off-track warnings; approximate fixes pause progress until accuracy improves. The map follows real reported positions and the watch stops with **Stop**, tab hiding, navigation start or leaving Map. It does **not** store these extra positions, automatically start, transmit, reroute or invent an arrival/safety claim.
- Retained the distinct **Route to recorded start** action from v0.2.139, which requests a *new* local Valhalla walking/driving route rather than assuming the historical track is navigable. Reverse GPS follow is a visual reference only: no exact reverse-track turn-by-turn road/trail instructions, background tracking, safety verification or promises about gates/closures/terrain.
- Added modular, pure local geographic projection and GPS-quality tests, backtrack browser-watch lifecycle tests and emergency tabs tests. **385 Python tests and 108 JavaScript test scripts passed**. A headless browser screenshot attempt was blocked by Chromium sandbox/socket permissions in the test workspace; real touchscreen and active GPS/Valhalla field checks remain operator verification. See `docs/RELEASE_0.2.140_TESTS.md`.

## OpenRF v0.2.139 — Walking/driving breadcrumbs, return to start and map controls (2026-11-19)

- Restored all four right-hand map-workspace buttons (Trip, Map settings, GPS/tracks, Offline maps) and the lower-right navigation gear during **both** walking and driving GPS follow. An earlier navigation-mode CSS rule hid these controls regardless of screen width. The route-focused HUD still replaces the destination form while following.
- Tightened the vertical grouping for the planned 1280×800 seven-inch display: subtle space between compass and recenter controls, and a consistent 12px gap from recenter to the four-button tool rail. No automatic opening of panels while driving.
- Set the Emergency sidebar triangle to the same pale color as the other sidebar icons, preserving the yellow header warning. Stacked both Analysis cards full width with a 16px vertical gap.
- Made private browser-GPS breadcrumbs explicitly **Walking or Driving**, with one opt-in recording at a time; existing walking histories automatically retain their pedestrian mode through an additive SQLite migration. The optional **Record this walk/drive** control is visible during navigation but never auto-starts. A navigation-started recorder stops when its navigation session stops; independent GPS-tool recordings remain separately controlled.
- Added mode-labeled saved tracks, **Reverse track preview** (the historical points in reverse order) and **Route to recorded start** (one fresh browser fix + a new local Valhalla walking/driving route). The latter deliberately may take a different path, refuses stale/approximate positions, does not auto-start follow, and never promotes a straight-line fallback to navigable guidance. Exports retain the mode and browser position provenance.
- Added usage steps, privacy warnings, driving mode/API/migration and return-button tests. **385 Python tests and 106 JavaScript regression scripts passed** in the development environment. No actual outdoor GPS walk/drive, seven-inch touchscreen screenshot, physical Pi receiver or local Valhalla route was verified; see `docs/RELEASE_0.2.139_TESTS.md`.

## OpenRF v0.2.138 — Clearer destination controls, radio menu polish, manual walking recovery (2026-11-19)

- Reworked the map's **Destination selected** popup: the Driving/Walking directions button uses a full-width first row, followed by **Change start** and **Change destination** on the same line. Added breathing room between the status text and actions. Retained route preferences and the existing driving Start action where eligible, with safe wrapping at compact screen widths.
- Added 18px separation between the **Tune a frequency** and **Linux receiver setup** cards. Renamed the sidebar's vague **Spectrum** item to **Signal Viewer** (accessible as "spectrum and waterfall"), while leaving the technical page title **Spectrum & waterfall** intact. The Radio receiver's internal link now says Open Signal Viewer.
- Replaced the Emergency sidebar's flag with the *same warning-triangle SVG* used by the header Emergency shortcut, using a compact warm warning color without changing the button's destination or SOS semantics.
- Continued walking navigation with an **explicit, manual "Replan walk from here"** button shown only when a fresh, accurate (±35m or better) real GPS fix is off the mapped Valhalla pedestrian line. A tap sends one loopback pedestrian route request from that measured position to the original destination; valid complete paths replace the plan and stop follow so the operator can inspect it and choose Start again. No automatic walking rerouting, fake GPS, silent recording or uploads.
- A missing router, unsafe/direct-line response, stale/approximate GPS fix or route with intermediate stops cannot silently replace the original walking plan. Stopping navigation while the request is pending invalidates its response. Existing driving navigation, offline breadcrumb recorder, hardware reporting and user data are untouched.
- Added two targeted regression scripts for the popup/menu/radio UI and pedestrian recovery; **383 Python tests and 105 JavaScript test scripts passed**. Real GPS/Valhalla, outdoor route access and screenshot QA remain operator checks. See `docs/RELEASE_0.2.138_TESTS.md`.

## OpenRF v0.2.137 — Start walking navigation and GPS-follow map (2026-11-19)

- A complete, locally generated Valhalla **pedestrian ROAD_ROUTE** now shows its own **Start walking navigation** button directly below the Walking directions heading. The driving Start button remains hidden in Walk mode. A straight-line reference, missing pedestrian geometry or driving route cannot start walking follow.
- Tapping Start explicitly requests fresh browser geolocation and checks an optional already-configured local `gpsd` receiver only while this session is active. A compact walking HUD displays a **Stop** button, reported GPS quality/source, the current mapped turn, approximate remaining distance and the next maneuver, with planned turns accessible separately. The map follows actual positions north-up; no fake movement or start-of-route camera jump is presented as a live fix.
- Live turn progress pauses for stale or inaccurate fixes, or when the reported position is away from the mapped route. Manually panning suspends map-follow until the existing crosshair control resumes it. Stopping ends the geolocation watch and GNSS poll, preserves the walking route and restores Start. No GPS history is written or uploaded.
- Kept pedestrian follow independent of driving-only lane/camera/voice/automatic-reroute features. Local walking graph availability does not validate trail access, sidewalks, closures, road crossings or safety; **no walking automatic rerouting or spoken prompts** in this first GPS-follow iteration.
- Added walking-specific pure route-positioning tests and a simulated browser callback lifecycle test; carried forward existing 383 Python and 103 JavaScript regression scripts. Real GNSS hardware, browser UI screenshots, on-path accuracy and installed Valhalla graph behavior require operator verification. See `docs/RELEASE_0.2.137_TESTS.md`.

## OpenRF v0.2.135 — OSM walking-path emphasis and local pedestrian graph check (2026-11-19)

- In **Where to? → Walk**, highlight footpaths, paths and bridleway classes from the selected OpenMapTiles-compatible vector source using thin dashed teal lines; show mapped tracks in amber. This is an opt-in visual emphasis of the map's **existing** OSM data, not newly inferred routes or verified public hiking access. Drive mode hides the emphasis, and the layers restore after light/dark or online/offline vector style changes.
- Added a compact walking-only caution inside destination search; preserves the full-screen map, wide-screen sidebar and existing map controls. No GPS permission request, automatic map download, route initiation or observation recording occurs from merely switching travel modes.
- Extended the local WSL Valhalla `--doctor` to try a fixed short public pedestrian example **in addition to** its driving example. The result checks local pedestrian routing for only those public test coordinates, not the user's trail, GPS position, safety or a region-wide graph. The `--plan` output clarifies that a shared OSM-derived Valhalla graph can already contain pedestrian ways; no second walking PBF is necessary solely to enable walking costing.
- Added focused map overlay and doctor regression checks, documentation and manual test steps. Offline graph construction, hiking trail graph completeness, walking GPS-follow/reroute and real hardware verification remain future work.

## OpenRF v0.2.134 — Restore full-screen Map and align legend on wide layouts (2026-11-19)

- Fixed a v0.2.133 startup-stopping browser error: directions resize tracking called `ResizeObserver.observe()` on a missing `map-directions-actions` element. Added the missing ID and a safe element-presence guard. This prevented the usual initial Map activation, producing duplicated Survey map headings, a normal page header instead of the full-screen workspace, and an uninitialized blank map on supported browsers.
- Repositioned the **Survey location** and **DEMO (optional)** map legend at the bottom-left of larger map layouts, immediately beside the map credits/info icon. Fixed a conflicting top-and-bottom CSS positioning rule that stretched the legend into the middle of the map.
- Preserved the larger-screen expanded sidebar, existing map controls, labels and attribution disclosure; the compact mobile breakpoint still hides the legend where map space is restricted.
- Added regression tests for the startup element contract and the legend's final positioning rules. No RF scanning, navigation routing algorithms, map data or Raspberry Pi hardware behavior changed.

## OpenRF v0.2.133 — Start single driving routes; choose walking trips on the map (2026-11-19)

- Fixed the single-route navigation dead end: a complete Valhalla driving route automatically expands Directions and exposes an always-visible **Start navigation** button immediately beneath Print / Save HTML / Save JSON, above the turn list. The button uses the existing opt-in, driving-only GPS-follow gate; direct-line references and walking previews cannot enable it.
- Preserved the route-choice sheet for genuine alternatives by collapsing Directions when an alternative comparison is available, including after choosing a different road. A comparison with no distinct alternate keeps the expanded single-route Directions and Start action.
- Made the map-picked destination popup taller and laid out its actions as touch-friendly two-column rows. Added **Drive / Walk icon buttons at the top of Where to?**, before either From or Destination: one mode-aware Get directions action now uses the chosen travel mode for both typed and map-picked destinations. Walking hides driving-only camera preference and GPS-follow controls; the selection does not itself request location or contact a router.
- Added **Plan walking route** alongside **Plan driving route** to the detailed trip planner. Either mode can use the operator's selected starting point, up to ten optional stops, and a destination selected by map tap or text/coordinates. Walking plans request local Valhalla pedestrian costing and display their own expanded turn list, without presenting driving-only camera comparison, road avoidance, export controls or live GPS guidance.
- Kept missing pedestrian graph data honest: when local Valhalla cannot find a connected foot-accessible path, only an explicitly labeled direct-line *reference* may appear. It is not a safe or navigable trail. No downloadable map data, walking turn-follow, rerouting, terrain access verification or hardware field tests were added.
- Added JavaScript regression coverage for the single-route Start path, mode-specific safety gates, walking origin/destination wiring and the expanded destination popup; incremented release asset cache and API version to 0.2.133.

## OpenRF v0.2.130 — Emergency layout polish and offline walking route previews (2026-11-19)

- Added consistent vertical spacing between Emergency page panels, refreshed form gaps/button alignment, and a dedicated responsive two-button row for check-in map pins and GeoJSON exports. The controls stack cleanly on very narrow screens; no existing actions or data behavior changed.
- Centered the clock/calendar in non-map page headers at usable widths, retaining the existing compact right-side clock on the full-screen map.
- Added a separate **Plan walking route** action to map destination search. When local Valhalla supports pedestrian paths in the installed OSM-derived graph, it requests `costing=pedestrian` over loopback and renders a distinct dashed walking route with planned maneuvers.
- Walking results are clearly planning-only: no automatic GPS follow, reroute, driving lane, or camera-route comparison; trail accessibility, weather, conditions, slope and current closures remain unverified. Existing driving routing and navigation remain unchanged. Local trail graph coverage is not bundled or assumed.
- Added strict pedestrian-mode validation and regression coverage for local route costing, rejection of driving-only preferences, independent frontend selection, and skipped camera comparisons.

## OpenRF v0.2.129 — Guarded offline restore and clock/calendar (2026-11-19)

- Added a stopped-server recovery CLI (`python3 -m openrf.restore --backup PATH`) with hidden passphrase prompt, verification preview, explicit typed confirmation, SQLite sidecar/journal safety checks and an interprocess exclusive recovery lock that the running OpenRF server also holds.
- Before replacing the primary SQLite database, the CLI creates and validates a restricted-permission timestamped safety copy; the verified decrypted replacement is staged on the same filesystem and atomically swapped. On post-swap verification failure, the safety copy is used for rollback. External data directories and separately stored radio histories are never replaced.
- Web UI remains preview-only and documents the separate recovery commands; no unauthenticated HTTP restore endpoint, remote writeback or automatic restart. The CLI refuses to restore while the app holds the lock; stop OpenRF before recovery. Actual on-device recovery should be rehearsed with expendable data before field reliance.
- Added a compact header clock and offline interactive month calendar with previous/next/today controls, selected-date description, local timezone and a warning that the device clock is unverified. No account, network time sync, GPS or calendar upload needed. No event reminders yet.
- Added tests for recovery lock refusal, safety copy contents, explicit confirmation, post-restore records, browser calendar assets and no HTTP restore route.

## OpenRF v0.2.128 — Encrypted emergency backups and restore preview (2026-11-19)

- Added opt-in AES-256-GCM encrypted snapshots of the primary SQLite database using an optional `cryptography` package and PBKDF2-HMAC-SHA256 passphrase derivation (600,000 rounds, fresh random salt and nonce). No plaintext backup is written to disk, password is not stored, and a snapshot is prepared only after an explicit action.
- Added downloadable `.orfbak` and in-memory encrypted backup verification with wrong-passphrase/tamper rejection, SQLite quick-check and limited table-count restore preview. This release **does not restore** or replace live user files.
- Bounded snapshot creation to 16 MiB of SQLite and encrypted input to 24 MiB. Canonicalized SQLite WAL-mode snapshot image headers so decrypted snapshots can be safely inspected independently in memory.
- Added OS-reported low-storage warning thresholds (<1 GiB available or <10% free). No automatic cleanup/deletion, cloud upload, account, backup scheduling or raw investigative data in source control.
- Added tests covering encrypted round trips, no plaintext leakage, tamper and wrong-passphrase rejection, read-only preview, size/validation constraints and HTTP availability. No restore/migration procedure is supported yet.

## OpenRF v0.2.127 — Device survival diagnostics and pre-departure readiness (2026-11-19)

- Added read-only Linux power supply inventory for reported batteries and external power state. Battery percentage is shown only when the kernel reports one; WSL, unsupported UPS boards and missing drivers show UNKNOWN, and runtime estimates remain unavailable.
- Added local disk free-space diagnostics and SQLite quick-check using a read-only connection. A quick check is not an export/backup guarantee. No power-control, low-power mode, shutdown, driver probing or battery cutoff is enabled.
- Added a durable six-point pre-departure checklist in SQLite: battery, offline maps, actual radio peer test, GNSS, equipment and storage. Each confirmation records UTC time and is explicitly human-attested, never a live sensor verdict.
- Added a compact, manual-refresh touchscreen panel and unit/API tests for sysfs battery interpretation, storage/database, checklist persistence, bad inputs and loopback-only access. Physical Pi/UPS tests remain pending.

## OpenRF v0.2.126 — Offline emergency operations dashboard (2026-11-19)

- Added a read-only, on-demand Emergency operations dashboard with latest saved status per person label, prioritized NEED_HELP reports, last-recorded age/freshness and provenance. Report timestamps are local storage times, not proof of ongoing safety.
- Added pending inbox review count, outbox state breakdown (ready, failed, uncertain after restart, submitted but not delivered) and locally saved team-recipient totals. Radio readiness comes from existing transport manager state, not assumed peer reachability.
- Added a compact 5-inch-friendly status strip, separate person/queue lists and explicit refresh. No automatic scans, transmissions, acknowledgments, rerouting, continuous geolocation, or peer surveillance.
- Added pure aggregation and loopback API tests for stale and duplicate reports, uncertain send status, transport readiness, and no cross-origin/remote exposure. Live hardware verification remains pending.

## OpenRF v0.2.125 — Compact emergency check-in protocol (2026-11-19)

- Added strict, byte-bounded ORF1 check-in text format (180-byte Meshtastic-safe maximum) with random 12-hex-character message IDs, UTC Unix timestamp claims, status, human-readable person label and optional note encoded safely for transport.
- Added an Emergency touchscreen composer that saves a local unsent draft, then optionally queues separate copies for each configured team recipient. Existing explicit outbox Send controls remain the only transmission mechanism; no background send, retries, or broadcasts.
- Added protocol-aware inbox annotations for structured check-in and ACK text. Parsed sender names, timestamps and status remain unverified claims; acceptance into the family board still requires a separate human review.
- Added a manually prepared short acknowledgment *text* action. A received ACK message does not imply cryptographic sender authentication, delivery confirmation or that a person read the message. No automatic acknowledgment or response occurs.
- Added validation and API regression tests for round-trip encoding, malformed payloads, byte limits, local queueing and unreviewed inbox entries. Real radio interoperability remains untested.

## v0.2.101 — Field-network gateway architecture + offline trip preflight (2026-11-17)

- Add an explicit read-only **Field network** panel in Hardware, distinguishing Linux-visible ordinary Wi-Fi and known HaLow interface candidates. Use bounded, sanitized `iw phy <phy> info` mode inspection to show OS-reported AP/station/mesh-point capabilities, with no SSIDs, BSSIDs, IP addresses, device serials or raw command output.
- Explore separately planned network roles: conventional Wi-Fi hotspot, HaLow AP, HaLow station, dual-radio gateway and optional Reticulum transport. No activation endpoints, credentials, hotspot configuration, bridging, DHCP, firewall changes, packet generation, RNS forwarding or OS privilege escalation. Simultaneous radio roles and actual hardware/peer connectivity are not verified; management remains loopback-only.
- Add a collapsed **Map → Offline navigation readiness** section with an operator-triggered diagnostic distinguishing local Valhalla HTTP health from visual regional vector fonts and installed raster map packages. No GPS fix, chosen road route or road graph coverage is claimed from a preflight. It does not access external endpoints, trigger GPS permission or alter existing routes.
- Add deterministic Python capability parsing, absent-hardware, privacy and API tests; JavaScript mode-selection, no-background-requests and diagnostic display tests. Preserve prior map, navigation, messaging, HaLow and radio features without new mandatory packages or database schema changes.

## v0.2.100 — Linux Wi-Fi HaLow connection diagnostic (2026-11-17)

- Add an explicit **Hardware → Wi-Fi HaLow → Inspect local link** check for Linux network interfaces with recognized HaLow-associated driver names. Report Linux operstate/carrier, IPv6 link-local prerequisite and optional read-only `iw dev <interface> link` association status. Reject unknown/unrecognized interfaces and malformed HTTP query parameters; never execute operator-supplied shell text.
- Read eight cumulative kernel network-interface packet/byte/error/drop counters without generating traffic. Serialize unsigned counters as exact decimal strings; the UI computes positive deltas between two manually requested checks of the same candidate and labels counter reset/missing fields rather than assuming zero or claiming RF throughput. No network SSIDs, BSSIDs, MACs, IPs, CLI output or stderr are returned.
- Distinguish OS-association status from verified 802.11ah RF, peer reachability, IP/multicast transport, Reticulum forwarding and message delivery. No automatic network probe, driver installation, access point configuration, radio scan, background refresh, mandatory dependency or schema migration. Actual hardware verification remains outstanding.
- Add mocked Linux sysfs/`iw`, failure/timeout, privacy, input validation, HTTP and frontend counter/consent tests, preserving previous HaLow preflight and manually gated Reticulum interface selection.

## v0.2.97 — Unified mesh connection management and safe local stops (2026-11-17)

- Add a compact Hardware-page connection manager covering independent Meshtastic and Reticulum local state, Linux USB serial access, claimed/unclaimed OpenRF ports and actual RNS-reported interface counters. A new read-only local endpoint composes existing manager reports without opening, probing or reconfiguring any radio.
- Distinguish SDK-open USB sessions, selected RNode ports, OS-visible ports, RNS UP/DOWN state and unverified RF reachability/delivery. Never imply firmware verification, transmitter position, peer identity or live link quality from inventory or counters.
- Add confirmed **Disconnect Meshtastic** and **Stop Reticulum** controls that call existing same-origin loopback APIs, without erasing opted-in messages or contacts. Existing messaging pages refresh status after either action. Opening Hardware never starts any radios.
- Add Python status-composition, absent/failure, privacy and API tests and a JavaScript simulated refresh/confirmation/stops test. No Python dependency, migration, cloud upload or Mesh↔Reticulum bridge. Real LoRa links, Pi touch, HaLow and live firmware diagnostics remain unverified.

## v0.2.96 — Multi-RNode setup and evidence-limited link counters (2026-11-17)

- Support one or two **distinct physical USB RNodeInterface** profiles in the explicit Reticulum start operation. Legacy single-radio callers remain supported; multiple profiles require distinct validated Linux USB ports and radio parameters, and preserve original operator settings and identities.
- Add a compact second-radio setup section, off by default and unavailable until the first is chosen; a single activation confirmation covers the chosen radios, and forwarding remains a separate confirmation. The app blocks Meshtastic port conflicts for either selected RNode.
- Track real RNS RX/TX byte-counter increases between connection-diagnostic refreshes. Restart, missing counters, or decreasing/reset counters invalidate comparisons. Show no RF strength, delivery, path-quality or live signal claim from them.
- No network discovery, radio probing, automatic transmit, software bridge between Reticulum and Meshtastic, RNodeMultiInterface firmware support, HaLow driver/BATMAN-adv integration, new required dependency, or database migration. Hardware tests remain necessary.
- Add Python multi-profile/config/compatibility tests and JavaScript multi-profile and counter-delta tests, plus release instructions.

## v0.2.95 — Opt-in USB RNode and cautious Reticulum forwarding (2026-11-17)

- Add read-only USB serial candidates and access diagnostics to the Reticulum page and API. Neither a serial port nor a conventional Wi-Fi adapter proves RNode firmware or Wi-Fi HaLow capability; no auto-probe or RF traffic is initiated.
- Allow an explicitly selected USB RNode to join the existing isolated Reticulum worker via a validated RNodeInterface profile (902–928 MHz operator-entered values; firmware/band/regulatory support remain unverified). An RF warning requires confirmation before starting.
- Add a separate, default-off Reticulum transport forwarding / relay consent. Only a selected RNode permits enabling it, and its generated worker config forces transport off when that box is not selected. Existing private RNS operator config, LXMF identity, AutoInterface, optional TCP and messages stay intact.
- Preserve the completely separate Meshtastic bridge and its firmware-owned relay behavior; add a port-conflict guard when either UI tries to claim a USB endpoint already in use by the other. This does not create a Meshtastic↔Reticulum gateway. HaLow and BATMAN-adv remain future integration stages.
- Add Python validation, configuration-file, passive-readiness and API tests plus JavaScript UI safety/setup tests. No new mandatory dependencies, database migration, auto-connection, background RF scan or upload. Actual LoRa reception, relay operation, radio regulatory suitability, Wi-Fi HaLow and Raspberry Pi touchscreen/USB operation are not yet verified.

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

## v0.2.88 — Separate Mesh and Reticulum message screens with one-tap reply (2026-11-15)

- Expand Messages in the sidebar to independent Mesh messages (Meshtastic) and Reticulum (LXMF over LAN/TCP) pages, each containing its existing conversation, composer and settings without forcing users to scroll past the other messaging platform.
- Incoming Reticulum messages with a validated 32-hex sender address show Reply, which fills the recipient and focuses the composer, and Copy address, which uses the clipboard or selects the address for manual copying when clipboard access is unavailable. No auto-send or address actions for sent/malformed rows.
- Keep the total unread count on the header envelope, but only clear a channel's unread when visiting its own inbox. If just Reticulum has unread messages, clicking the envelope goes straight to Reticulum. Maintain small-screen wrapped text, a readable two-column landscape layout, and no sideways scroll.
- Preserve explicit Enable/Stop, opt-in TCP listener on port 4242, dormant AutoInterface unless Reticulum is enabled, loopback-only HTTP service and unverified-delivery labels. No migrations, transmissions on load or OS firewall changes. JavaScript DOM regression added; actual Sideband/WSL UI needs operator testing.

## v0.2.94 — Full-width Reticulum conversation threads (2026-11-17)

- Replace the always-visible Reticulum dropdown/inbox/side-by-side composer with a scrollable conversation list and dedicated per-peer thread view. Sort conversations by their latest known event; include saved contacts even with no messages.
- Open selected threads at full width on the 5-inch layout, with a single composer, Back to Conversations, copy address and Save contact actions in the header, and no repeated per-bubble Reply/Copy buttons. Keep outbound status and validated inbound signature wording unchanged.
- Provide a New message flow for a manually entered LXMF address. Preserve unsent text separately for each thread in memory while switching peers, and transition a newly queued message into its dedicated thread. Do not persist drafts, reconnect devices, transmit on opening a thread, or infer read receipts.
- Preserve all v0.2.93 unread badges/explicit acknowledgment and existing contacts/history APIs. Add offline DOM tests for thread navigation, ordering, scoped drafts and message controls; field touchscreen and real Sideband delivery remain unverified.

## v0.2.93 — Explicit unread acknowledgment on both message pages (2026-11-17)

- Count genuine inbound Meshtastic and Reticulum messages even while their own inbox is active. Never treat opening or staying on the page as proof the operator has read them.
- Add independent **Mark all as read** controls and unread counts to both inboxes. The combined header envelope, individual header choices and sidebar badges stay visible until a deliberate acknowledgment; clearing all messages also clears their count.
- Show the compact message-envelope control on full-screen Map only while unread counts are nonzero, so the map stays quiet otherwise.
- Use compact SMS-like incoming/outgoing chat bubbles in both inboxes, with local-time summaries, full UTC values retained in tooltips, truthful routing/delivery detail and no made-up read receipts. Bring Meshtastic's per-peer message order in line with Reticulum: latest event first, stable on repeated polls.
- Preserve same-tab unread persistence and immediate recheck on return, and retain previous delivery-status honesty, per-contact filters, local history, transport permissions and privacy boundaries. No schema change or automatic radio transmission.
- Add deterministic JavaScript regressions for live messages on the open inbox, counter persistence, duplicate-poll suppression, manual acknowledgment, renewed alerts after acknowledgment, small bubble layout contracts and mesh newest-first filtering. Field UI and live radio behavior remain operator-test items.

## v0.2.92 — Newest-first Reticulum inbox (2026-11-17)

- Show recent LXMF texts at the top of both the full inbox and per-contact conversations. Reorder only a copy of the received event list, keeping message history and unread sequence tracking intact.
- Keep the inbox positioned at the top on new messages; preserve scroll position while someone reads older messages and reset to the top on a deliberate conversation change or reply.
- Reject saving an LXMF address already in Contacts, with a clear warning in both quick-save and the contact form. Existing address nicknames only change through explicit **Edit → Update contact**; Cancel edit restores add mode. The same distinction is enforced by the loopback API (409 duplicate, 404 missing edit target), using the existing SQLite address key without a schema migration.
- Preserve v0.2.91 replies, opt-in local history, transport controls and private-data boundaries. Add repeat-render, filter, scroll-position and duplicate-contact tests. Real Sideband/RNS message ordering on the user's hardware remains to be confirmed.

## v0.2.91 — Reticulum contacts, conversation filtering and private history (2026-11-17)

- Add explicitly saved Reticulum contacts with short nicknames, safe local editing/removal, and an inbox filter per peer.
- Add optional private SQLite message history, maximum 1,000 texts; only user opt-in writes message bodies, retained after Reticulum stops, with explicit clear and disabling deletion. Saved contacts remain independent of message history.
- Give incoming validated LXMF texts and outgoing queued (not confirmed delivered) events human-readable statuses without inventing delivery receipts.
- Improve per-interface, peer and TCP client readouts with local diagnostic counters; preserve manually controlled AutoInterface/TCP and loopback-only HTTP.
- Add tests for private storage, de-duplication, history removal, same-origin API restrictions and UI logic; physical mesh/LXMF delivery remains user-verification work.

## v0.2.90 — Header inbox chooser and reliable tab navigation (2026-11-17)

- Replace the direct-message envelope jump with a two-choice dropdown for Mesh messages and Reticulum, including accessible per-channel unread totals; keep map header minimal.
- Keep genuine inbound-only unread counts through a same-tab refresh and temporary Reticulum status transitions; clear only the inbox actually opened. Continue read-only polling on the local mesh inbox after a USB disconnect, so late receipts can be reflected without reconnecting.
- Remember the active page in tab-scoped session storage. Default entirely new tabs to Map, and show Map above Overview in the sidebar on all screen widths.
- Add focused front-end tests for these behaviors, preserve no-auto-connect/no-transmit guarantees and existing backend storage and API contracts. Actual RF/Sideband delivery still requires physical testing.

## v0.2.89 — Independent sidebar unread counters and foreground refresh (2026-11-15)

- Remove the cramped aggregate badge from the Messages parent dropdown. Place separate compact, right-aligned teal counters on its Mesh messages and Reticulum children; keep the header envelope as the total of both channels' genuine unread messages.
- Make the unread indicators accessible via the child buttons' labels and lightly accent the Messages parent icon when it has unread messages. Preserve per-inbox read clearing and no automatic send.
- Poll already-connected/explicitly-enabled message inboxes immediately when a backgrounded OpenRF tab regains focus or visibility. Keep existing periodic polling and in-flight guards so no auto-connect, auto-announce, unintended radio activity or redundant overlapping requests are introduced.
- Add separate counter-layout and foreground-refresh regression tests. No backend changes or persistent data migration. Browser/Sideband behavior must still be verified in the user's actual environment.

## v0.2.98 — Passive Wi-Fi HaLow (802.11ah) hardware discovery (2026-11-17)

- Add Linux-only, read-only HaLow readiness endpoint and five-inch-friendly Hardware panel, with explicit refresh and an offline setup checklist plus vendor reference links. Detect known Morse Micro/Newracom sysfs network-driver names, module presence and USB product-description hints; show OS UP/carrier as unverified information, never proof of RF/IP/LXMF transport.
- Keep the Meshtastic, RNode and Reticulum subsystems independent. Do not auto-install vendor drivers, configure regions, scan Wi-Fi, connect to APs, transmit, configure IP routes or bridge HaLow into Reticulum. No new Python/JS dependency, private data output, data migration or network startup.
- Add deterministic Python fake-sysfs tests for missing/WSL hardware, Morse interface UP+carrier, Newracom loaded module, USB candidate privacy and GET/static endpoint; add a JavaScript passive refresh/no POST UI test. Physical HaLow hardware, Raspberry Pi OS, kernel/vendor compatibility and actual peer/forwarding remain unverified.

## v0.2.99 — Opt-in Wi-Fi HaLow interface for Reticulum (2026-11-17)

- Add a separate, default-off HaLow AutoInterface selector under Reticulum and a one-shot read-only readiness refresh. Select only a recognized Linux HaLow driver interface with OS UP and link-local IPv6; never assume USB descriptor, carrier, link-local IP or driver name proves RF/IP reachability.
- On explicit Reticulum Enable and confirmation, revalidate Linux prerequisites and scope the managed AutoInterface to the selected network name in a generated **temporary** RNS config. Preserve the operator's base config and independent TCP/RNode settings; do not open a TCP listener or enable forwarding implicitly.
- Refuse malformed device names, missing or stale host prerequisites and custom operator-managed AutoInterface device restrictions. Nothing starts on page load; no vendor driver install, Wi-Fi association, network scan, AP/router setup, privileged command, packet capture or Meshtastic↔Reticulum bridge.
- Add Python deterministic sysfs/IPv6, validation, generated config, coexistence and HTTP rejection tests, plus JavaScript read-only selection and no hidden connection tests. Live HaLow, real multicast, Pi OS/RNS compatibility and LXMF peer delivery remain **untested**.

## v0.2.102 — Opt-in local Wi-Fi hotspot + Hardware panel spacing (2026-11-17)

- Add **Hardware → Field network → Local Wi-Fi hotspot** start/stop/refresh controls with generated or user-entered WPA password. Only an ordinary Linux Wi-Fi adapter with OS-reported AP support and a currently **disconnected** NetworkManager state is eligible; HaLow candidates never substitute for a phone hotspot radio. Starting requires explicit confirmation, never happens on opening Hardware, and does not interrupt a Wi-Fi connection already in use.
- Create an OpenRF-owned NetworkManager profile with explicit WPA-PSK/RSN (WPA2), `autoconnect=no`, AP mode, shared IPv4 DHCP/NAT and disabled IPv6. NetworkManager's short `wifi hotspot` helper is deliberately avoided because some implementations can fall back to WEP. **A separate internet uplink may be shared**, as explicitly warned before Start. No automatic LAN dashboard exposure: the OpenRF HTTP/JSON API stays bound to loopback, and this is not an active HaLow/LoRa/Reticulum bridge.
- Track only a generated profile UUID, friendly name, interface and SSID in a private outside-Git ownership file. Do not save or return the WPA passphrase in OpenRF API responses, logs or its database; NetworkManager retains the credential while the profile exists and its initial configuration passes a secret through a short-lived local process argument. Stop and normal OpenRF shutdown attempt to deactivate/delete only the verified, exactly owned profile; failed operations retain recovery state.
- Give Mesh connections, Field network and HaLow Hardware panels 16px separation, plus inset padding and wrap-safe buttons for the new hotspot card on small screens. Add deterministic mock-NetworkManager/API/JavaScript consent, failure, password and spacing checks; physical Raspberry Pi/WSL Wi-Fi AP operation is not yet hardware-tested.

## v0.2.103 — Opt-in OpenRF-to-OpenRF TCP connections + two-node lab (2026-11-17)

- Extend existing **Reticulum** settings with a confirmed outbound `TCPClientInterface` targeting one numeric loopback/RFC1918 private IPv4 peer, plus a configurable local `TCPServerInterface` port (1024–65535). No external hostnames, public IP targets, automatic connection, user-supplied arbitrary RNS config, automatic forwarding, or management-API LAN exposure. The existing listener remains off by default and binds network interfaces only after user action.
- Generate isolated, private Reticulum runtime configurations for either side of an OpenRF-to-OpenRF connection, preserving operator-managed files and separate node identities. TCP interface creation only becomes active after **Enable LAN messaging**, and the local HTTP API remains loopback-only. A configured TCP client/server is not verified link establishment or delivered LXMF.
- Correct the opt-in ordinary Wi-Fi hotspot profile from `ipv6.method disabled` to `ipv6.method link-local` so the underlying interface can support Reticulum AutoInterface IPv6 link-local discovery. This does not prove IPv6 multicast reaches Wi-Fi clients, HaLow peer connectivity, or an existing hotspot can be changed without being restarted. WPA2-only, idle-adapter and no-autostart safeguards remain intact.
- Add `scripts/run-two-node-lab.sh`: launches two separate, loopback-only OpenRF development consoles with distinct temporary private data and ports 8871/8872; does not automatically enable Reticulum, start radios, send traffic or erase its lab data. Operator can manually start TCP listener 4242 on A and private TCP client 127.0.0.1:4242 on B, after installing optional RNS/LXMF packages.
- Add deterministic two-node configuration, private-address input validation, HTTP isolation, unchanged-defaults, opt-in UI and link-local compatibility tests. No Reticulum/LXMF dependencies were available in this build environment; **live encrypted LXMF message delivery remains unverified**.

## v0.2.104 — Local vector map recovery + message badge alignment (2026-11-18)

- Check packaged Amador/Calaveras vector MBTiles and glyphs before initializing the map; retain the full-US online overview, automatically use local vectors after a real browser fix inside its known bounding box, and return to the global style for a subsequent fix outside coverage. Save manual offline/online preference locally without retaining coordinates.
- On a failing online vector style, attempt the installed offline vector style once before the built-in raster/coordinate map. Distinguish a synchronous browser MapLibre/WebGL startup exception from missing tiles, preserve the map view when possible, and show clear diagnostics if the vector renderer cannot start. Never mislabel vector MBTiles as raster coverage.
- Anchor the compact header unread count to the envelope glyph and restore its proportional size on 5-inch layouts, without changing genuine message count behavior.
- Add frontend regression tests for source selection, persistence entry points, bounded recovery, renderer messaging and badge structure. No backend schema or new mandatory dependencies. Firefox/WebGL behavior on the user's graphics driver and actual map rendering on their computer remain unverified.

## v0.2.105 — Visible basemap source checks + gear-panel placement (2026-11-18)

- Fix a false-success condition: `style.load` was treated as complete map success even when the OpenMapTiles source delivered **no visible map features**, causing an unexplained dark map after WebGL was restored. Verify rendered basemap features after the map becomes idle; if missing after nine seconds, attempt the installed regional vector archive when eligible or show a small, nonblocking diagnostic instead of silently hiding the map error.
- Frame installed Amador/Calaveras coverage when starting an explicitly offline map or automatically recovering from failed worldwide tiles. This intentionally changes the default national view only in those local-region cases; a working online Auto map still opens with the wider U.S. overview.
- Anchor the map-settings sheet above the lower-right gear using measured screen coordinates on open, resize and scroll. Clamp size and scroll tall contents within the panel, including in 800×480 landscape. Retain existing route preferences, layers, observations and message badges.
- Add deterministic source-error recovery and gear-layout regression tests. No change to MBTiles assets, WebGL settings, drivers, database or network disclosure. Real Firefox/Intel GPU and local geographic tile drawing must still be verified by the operator.

## v0.2.106 — Preserve vector renderer through GPS style changes (2026-11-18)

- Fix an error-handler race reported on Firefox: the world map initially rendered, then an automatic GPS fly-to switched to Amador/Calaveras regional vector tiles; a single tile or source request error while `mapReady=false` scheduled a full raster/coordinate fallback after only 500 ms. Treat individual resource errors as recoverable, retain the MapLibre renderer, and show a non-blocking diagnostic.
- Replace the old twelve-second silent-style fallback with a non-destructive warning if neither online nor installed regional vectors finish loading. A real synchronous WebGL/MapLibre constructor failure can still invoke the coordinate fallback. No map-source selection, map bounds, tile format or data was changed.
- Add a regression test asserting that tile-error and style-timeout branches cannot tear down an otherwise healthy vector map. Preserve the landscape settings popup and all existing features. Physical Firefox rendering and GPS transition remain operator verification steps.

## v0.2.107 — Official application branding and camera-viewport validation (2026-11-18)

- Use the exact approved OpenRF brand-kit artwork in the Linux field console: dark-background wordmark in the sidebar, 32px favicon, 180px Apple touch icon, and 192/512px app icons in a local manifest; keep the 5-inch map workspace uncluttered. The standalone original brand-kit ZIP is not bundled.
- Whitelist and serve these six local PNG files plus the manifest from the loopback HTTP server. An old `/favicon.ico` browser request now returns the official 32px PNG with `image/png` rather than a 404.
- Reject non-geographic/world-wrapped client map bounds before calling `/api/cameras` so the nationwide overview no longer repeatedly generates HTTP 400. Inform the user that the camera layer becomes available at a narrower viewport.
- Bump bundled Python version and release manifest. The reported blank regional MapLibre view remains an open diagnostic task; style JSON HTTP 200 alone does not verify that offline tile/glyph resources or geographic layers render.
- No modifications to offline map data, GPU configuration, user SQLite data or network services; real Raspberry Pi/browser rendering and connected radio links remain unverified.

## v0.2.108 — Offline readiness gear and selectable trip origin (2026-11-18)

- Preserve the right-rail Map settings overlay, and move the existing read-only Offline navigation readiness panel beneath the bottom-right gear with the other route and provider controls. Reparent its existing DOM node (no cloned inputs, duplicate IDs, new background checks, or new external requests), and constrain its content to the existing scrolling landscape popover.
- Add an optional map-tap starting point picker in Plan a trip. Share the proven vector/raster screen-to-coordinate path with destination picking, but write only the manual origin fields. Show a teal start marker; keep the separate red destination pin, cancel/drag safeguards, normal map panning, and browser location as the default.
- Resolve custom typed starting addresses through the existing opt-in/local address service for both full trip planning and the quick Get directions workflow. Recalculate after any start change; never silently reuse an old route or treat straight-line previews as drivable directions. Use a fresh browser position to return to the default.
- The reported offline regional renderer failure is not repaired in this version. Online vector rendering has been confirmed by the operator in Firefox; actual offline tile loading, decoding and source-style errors still require browser request/Console evidence. No changes to map archives, GPS measurements, user data or wireless hardware.

## v0.2.109 — Main Where to? starting point and road-router diagnostics (2026-11-18)

- Add a compact **From** row before the primary destination field, showing browser location by default and offering an expanded address/coordinate editor, map point picker or current-location reset. Both quick and full-trip workflows share one origin, with synchronized typed/suggested values and correctly invalidated old road routes.
- Add **Change start** to the map-selected destination popup. When the quick origin is picked on the map, restore the main destination search with the existing destination and route-request controls intact. Maintain one-tap click/drag safeguards, teal origin pin and separate red destination pin.
- Add a manual **Check local road router** control in the quick search. If Valhalla is unreachable on local loopback, explain that the existing Docker container must be started. No automatic Docker start, hardware changes, or third-party network calls are added.
- Keep the existing right-hand Map settings, the bottom-right gear readiness panel, online map option, and region-limited offline map behavior unchanged. There is still no verified fix for offline regional vector rendering or a guarantee of road routing without a working local Valhalla graph.

## v0.2.110 — Genuine alternatives and route-choice comparison (2026-11-18)

- Reject camera-aware Valhalla alternatives whose road geometry stays substantially identical to the normal route. Use bounded distance-along-road samples so an alternative with the same physical road but different vertex density is not shown as a second choice. The main road remains selected and the service provides a clear explanation.
- Stack two genuine route choices vertically on compact 800×480 displays. Show main/alternate miles, time and mapped camera report counts, plus a relative difference summary on the alternate (longer/shorter, slower/faster, more/fewer reported cameras). Mark incomplete catalog data rather than implying verified coverage or real-time camera operation.
- Defensively suppress identical overlapping coordinates in the browser so a duplicate route is never drawn as an imperceptible dashed amber line beneath the selected teal route. Do not suppress distinct paths just because rounded ETA, mileage or camera counts match.
- Preserve the previously working Where to? custom starting-point flow, right-rail map settings, offline navigation readiness location, online vector option, GPS privacy boundaries, sensor APIs, local data and map archives. No physical hardware, Valhalla Docker service or full browser layout was changed or verified.

## v0.2.111 — Direction-aware camera comparison, with uncertainty (2026-11-18)

- Distinguish all locally mapped camera coordinates within 120 m of the Valhalla road from *potential encounters* based on recorded camera facing and approaching travel geometry. Parse OSM 16-point compass bearings, 0–360 degree headings and clockwise ranges; check both camera-facing road position and oncoming travel heading with wide uncertainty tolerances. Never discount unknown, ambiguous, malformed or too-short/degenerate geometry direction data.
- Preserve both proximity and directional totals in the route API (`count`, `nearby_count`, `excluded_by_direction`, `unknown_direction_count`, `direction_matched_count`) while still returning only potential-encounter sites for opt-in route alerts/exclusions. Retain the source-documented no-guarantee warning; zero estimates do not prove an unobserved road.
- Show **0 possible encounters (1 nearby)** when source data supports it. Add direction-based explanations on the alternate card and reveal mapped lens direction in camera pin popups. Preserve user choice, normal road, distinct-alternate checks, route settings and existing sensor/privacy behavior.
- Add backend and frontend regressions; no migration, provider change, silent camera-data download, offline vector fix, physical-camera check, or live road-trial claim.

## v0.2.112 — Conservative camera-count regression fix and maximum priority (2026-11-18)

- Correct v0.2.111's false-negative camera count: retain all reports near the road regardless of estimated heading. The formerly subtractive direction assessment is now annotation only (`not_direction_matched_count`) and cannot cause the normal route to say zero or suppress candidate exclusion attempts. A nearby camera can capture approaches beyond a single mapped viewing bearing; no lane or active camera state is established by map geometry.
- Add explicit opt-in **Maximum avoidance** under the existing navigation gear, alongside Balanced. The maximum priority tries at most four differing local Valhalla exclusion sets, re-evaluates the actual road geometry, ranks by **fewest reported nearby camera points first** (then distance), and preserves the main route and user choice. No strict time/distance ceiling is used for scoring; physical route graph limits, 8 combined exclusion slots, endpoint protection, incomplete records and actual road access still limit results.
- Retain direction annotations in the map and route details, but show total nearby locations rather than claiming inferred camera captures. The alternate-choice description identifies the relative miles, minutes and count. Opt-in priority and existing category choices persist in local browser storage.
- Add regression tests for the reported v0.2.111 failure and aggressive-priority rankings with large detours. No Docker, imported map data, private SQLite data, live GPS or hardware changed by the release.

## v0.2.113 — Start selected route and align bottom-right popups (2026-11-18)

- Add a full-width **Start navigation** button within the route-choice sheet. Tapping Main or Alternate updates the planned route preview as before; the new button delegates to the existing opt-in GPS follow handler for the *selected* road. Disallow direct-line previews and repeated starts. Preserve main/alternate route calculations, camera counts, comparison data and Maximum avoidance preference.
- Make the **×** on Choose a route discard the entire unsaved trip, including route comparison, directions, map lines, destination and temporary origin pins, and form fields. It invalidates in-flight route requests but does not remove saved destinations or stored avoidance preferences.
- Keep the route cards and tradeoffs independently scrollable so the action button remains visible at 800×480. The selected route is clearly identified in status and the accessible button label.
- Align bottom-right **Navigation & field readiness** gear, **Map layers** panel and map-opened **Add observation** form to one shared popup rectangle below the Where to?/hamburger row, above the bottom buttons, and left of the right-side map controls and page scrollbar. Internal scrolling and sticky close headers keep exit controls accessible. Plus still opens the consent-safe manual observation form, and the older centered form remains on non-map pages. Opening one map panel closes the others.
- Add regression tests for route selection/start and viewport popup geometry. No change to database schema, local GPS storage, external networks, map data, Valhalla backend or sensor drivers.

## v0.2.114 — Taller route chooser with scrollbar clearance (2026-11-18)

- Remove the 260px route-choice height cap at the measured Directions-heading anchor; allocate up to the lower map controls with a 46px bottom reserve for the map attribution/info button and adjacent controls. Retain a maximum and browser viewport bound, and keep scroll overflow for unusually long route notes.
- Reserve Firefox's overlay scrollbar gutter plus 7px inner padding, making the Main and Alternate cards slightly narrower without shrinking the overall navigation pop-up. Start navigation remains pinned in the chooser footer.
- When × discards a planned route, reopen the empty Where to? editor automatically. Replace the expanded search's redundant Close search text with an accessible compact ×. Opening/closing Route preferences from a currently expanded search no longer collapses it or changes an unfinished destination/start entry.
- Add 800×480 geometry and navigation-search regression tests. No changes to route geometry, Valhalla, camera counts, GPS permissions, selected-route behavior, private records or unrelated map menus.

# OpenRF v0.2.115 — Offline Emergency Foundation

- Added a dedicated emergency readiness page while retaining the map-first default.
- Added private SQLite storage for emergency contacts, meeting points, checklist tasks and unsent SOS drafts.
- Added opt-in local record creation, checklist completion, deletion and a server-backed readiness summary.
- SOS drafts are explicitly local and unsent; no emergency delivery, live battery readings or GPS fix is implied.
- Added local validation and API tests for emergency records and offline persistence.

# OpenRF v0.2.116 — Offline Emergency Reference Library

- Added private, searchable offline emergency text-reference records with user-entered source attribution; text is never fetched, uploaded or treated as verified.
- Added a source-labelled reference viewer, search field, add and delete controls to the Emergency page, with text-only rendering to avoid HTML injection.
- Added REST endpoints and SQLite storage for reference records and integration/unit tests.
- Added a documented roadmap for in-app AM/FM broadcast radio band selection, tuning, presets and audio controls with optional receiver hardware; no broadcast tuner is yet connected or implemented.

# OpenRF v0.2.117 — Offline knowledge pack import

- Added downloadable OpenRF starter pack (three original CC0 planning worksheets), plus local JSON pack import and installation controls.
- Added strict data-only pack validation (format, required metadata, entry counts and size limits) and transaction-based SQLite imports with duplicate re-import suppression.
- Preserve existing local reference entries; pack text displays attribution and cannot execute HTML or scripts.
- Added pack-validation and HTTP API tests. No external survival/medical publications have been bundled or downloaded.

# OpenRF v0.2.118 — GPS-assisted local SOS composer

- Added explicit opt-in browser geolocation to the emergency draft composer with reported accuracy, fix age, stale-data rejection, location removal and review before saving.
- Added four selectable message types and local-only draft storage; no radio/network transmission or emergency-service contact is attempted.
- Added server-side validation of browser-provided coordinates, accuracy, fix age and message length. Position is always labelled browser-reported and unverified.
- Kept the Emergency reference packs, map-first default and existing communications interfaces unchanged.

# OpenRF v0.2.119 — Explicit emergency radio handoff

- Added manual selection of a saved SOS draft, editable outgoing text, destination and Meshtastic channel or Reticulum LXMF address.
- Added explicit confirmation before calling the existing Meshtastic or Reticulum sender; no automatic SOS broadcast, retry or emergency-service contact.
- Added locally retained handoff attempts that distinguish failed submission, Meshtastic submission, LXMF queueing and Reticulum path requests from **recipient delivery**, which remains unverified.
- Enforced current transport byte limits and destination validation; Meshtastic broadcast (`^all`) is not allowed in this emergency panel.
- Added tests using mocked manager responses; no physical two-node RF delivery verification.

# OpenRF v0.2.120 — Evidence-limited routing acknowledgments and retry preparation

- Correlate existing Meshtastic routing acknowledgments to manually submitted SOS attempts by packet ID, recipient, channel and full text; routing ACK is never labelled as read or human-received.
- Display recorded transmission attempts with their status and a manual Refresh routing status control. Reticulum remains queue/route status only.
- Add Prepare manual retry for failed/path-requested/routing-error attempts. It restores the previous text and destination but requires another explicit confirmation; no background resend.
- Migrate private attempt storage without erasing older records and remove attempt details when a draft is deleted.
- Run API and persistence tests using simulated radio managers; no physical radio delivery or Pi touchscreen verified.

# OpenRF v0.2.121 — Durable emergency outbox and network recovery

- Added a persistent, SQLite-backed offline emergency outbox for addressed Meshtastic or Reticulum messages, independent of radio availability at queue time.
- Added operator-confirmed Send Now, Prepare Retry, Remove and Refresh actions; never send or retry automatically after reconnect or restart.
- Interrupted sends recover to UNCERTAIN_AFTER_RESTART and require operator review, avoiding duplicate emergency transmissions after crashes.
- Added a read-only transport readiness summary based on actual Meshtastic and Reticulum manager state, without assuming remote RF reachability or message delivery.
- Preserved full messages and receiver addresses in private local storage and remove queued entries alongside their deleted source drafts. Warn if GPS coordinates in a saved draft may be stale.
- Added queue lifecycle/API tests including no-auto-send guarantees, explicit send results and one-time claim checks. Hardware networking remains unverified.

# OpenRF v0.2.122 — Family/team emergency coordination

- Added private team directories with nicknames, direct Meshtastic node IDs or Reticulum identities, and optional Meshtastic channel.
- Added grouped offline queueing: one separate addressed, persistent, manually sent outbox item per team member; no group RF broadcast or automatic transmission.
- Validate every recipient before saving, limit teams to ten destinations, reject duplicates, and require all items to fit their transport byte limits before committing the batch.
- Display and remove team members and use an existing saved SOS draft to queue copies for an entire team. Previously queued items are not rewritten when the directory changes.
- Added SQLite/API tests for atomic group queueing, invalid destinations, duplicate members and no automatic sends. Real node delivery remains unverified.

# OpenRF v0.2.124 — Reviewed radio check-in inbox

- Added an explicit, user-initiated snapshot import of received Meshtastic and Reticulum/LXMF messages into an offline SQLite review inbox.
- Suppress repeat imports, reject outgoing/demo messages, and accept Reticulum candidates only when the receiver reports a valid signature. None of these signals authenticates the named person or validates the message's claims.
- Review each candidate by separately entering a person label and status, or discard it. Accepted entries become historical `RADIO_MESSAGE_REVIEWED` check-ins with retained transport, radio address and receiver timestamp.
- Never import claimed remote GPS coordinates, automatically change family status, transmit, poll, alert, or infer real-time location. Physical radio testing is still pending.

# OpenRF v0.2.123 — Family check-ins and reported-status map

- Added quick Safe, Need Assistance, Evacuating and Check-in records with local persistence and clear self-report versus secondhand provenance.
- Optional opt-in browser location for self-check-ins, with bounded coordinates/accuracy and 60-second freshness; no automatic sharing or continuous tracking.
- Optional creation of a separate unsent emergency draft from a check-in, ready for later deliberate team outbox queueing.
- Added local status board, historical timestamps, delete controls and opt-in MapLibre markers for the latest location-bearing self-reports. Markers are reported and historical, not verified live positions.
- Added explicit GeoJSON API for locally saved location reports and tests for provenance, bounds, persistence, no-transmission status and map data.

## OpenRF v0.2.131 — Private walking breadcrumbs, backtrack preview and Emergency shortcut (2026-11-19)

- Added an opt-in **Map → GPS and walking trails → Walking breadcrumbs and backtrack** panel. Start requests explicit browser location permission and a fresh position before creating a record. While the browser tab stays visible, accepted position fixes append to a local SQLite track. Stop ends the browser position watch; hiding the tab automatically stops it on a best-effort basis. Browser closure, permission revocation, and server restart never silently resume location recording.
- Records only browser-reported observer positions with UTC timestamps, source identity, age and accuracy; rejects older-than-30-second fixes, accuracy worse than 100 m, invalid values and implausible jumps. Includes minimum spacing, 5,000-point / 100-track limits, deduplication and interrupted-session recovery. No transmitter location, external GNSS hardware verification, live tracking or background Pi GPS logger is claimed.
- Added saved-track listing, on-map trail and reversed **backtrack visual preview**, clear preview, explicit deletion and confirmed exports in precise-coordinate GeoJSON or interoperable GPX. Start/end markers distinguish recorded outward travel from the reverse display. This is historical geometry—not turn-by-turn guidance, a validated hiking route, safe passage, emergency beacon or guaranteed means of return. Map overlays depend on a working map surface.
- Added an always-present amber Emergency triangle immediately left of the Messages envelope in non-map headers, and accessible over the map. It opens Emergency readiness in one click and **does not** create, transmit, or send an SOS. Existing Emergency functionality and sidebar navigation remain intact.
- Added Python persistence, validation, restart, geometry and HTTP endpoint tests plus a Node browser simulation checking explicit consent, poor-fix rejection and hidden-tab stopping. No physical handset, native GPS, offline trail dataset or walking field test was available; those remain pending.

## OpenRF v0.2.132 — Emergency form cleanup and private offline GPX trail library (2026-11-19)

- Rearranged Emergency family check-in controls: the UNSENT-draft checkbox is now a normal side-by-side checkbox row directly under Optional note, followed by the location-status message and then the fresh-location/remove-location buttons. The save action stays underneath. No check-in, location, draft or send behavior changed.
- Tightened Emergency radio handoff: the live UTF-8 byte counter sits immediately under Outgoing text; Save to offline outbox and Confirm and hand off to radio are left-aligned together with touch-sized buttons. Routing status/refresh and Offline outbox refresh now sit beside the associated information rather than being pushed to far right or centered in grid columns. Existing manual send, queue, confirmations, routing status and unread handling remain unchanged.
- Added **Map → GPS and walking trails → Offline walking trails**: explicitly import locally selected GPX routes/tracks (500 kB limit), retain disconnected GPX segments, show purple reference paths on a working map, view saved trail metadata, export GeoJSON or delete imports. Trail source/creator is required for attribution. No internet downloads, inferred paths, GPS permission, radio activity, trails declared verified/safe or background network traffic.
- Imported trail geometry is stored in a separate local SQLite database (`imported-trails.sqlite3`) with caps of 50 trails, 100 segments and 5,000 points per import. The original XML is never persisted. The existing encrypted emergency backup is intentionally limited to the main database and does not include this separate trail library. Imported references are clearly distinguished from actual browser-recorded breadcrumb history.
- Confirmed the combined Mesh + Reticulum milestone will be released as a complete messaging experience **in a future patch**: one inbox, one outbox, unified compose and transport-aware Reply, while retaining honest delivery states and not silently bridging networks. No partial combined inbox, auto-transmission, protocol bridge or composer replacement in v0.2.132.
- Added GPX parser validation, entity/DTD rejection, coordinate/size/point-count bounds, persistence and loopback-only HTTP tests, plus a simulated browser import/consent regression. Hardware, visual 5-inch usability, GPS data and downloaded external trail files remain unverified.

## OpenRF v0.2.136 — Walking turn-list fix and Font Awesome navigation icons (2026-11-19)

- **Fixed a real walking-directions regression:** Valhalla could return a valid pedestrian graph route, but the common route-sheet builder rejected any route with `is_driving_route=false` and emitted “A verified road route is required.” Walking routes now render their own turn list without being discarded as a direct-line reference. GPS follow, driving simulation, lane guidance and camera-aware features remain driving-only.
- Replaced the handmade Drive/Walk selection glyphs with the **Font Awesome Free 6.7.2** solid `car-side` and `person-walking` icons. Removed the arrow from **Get driving directions** (also **Plan walking route**) and placed a local Font Awesome `location-arrow` on the **Start navigation** controls. No remote icon CDN or dependency; attribution/license recorded in `docs/THIRD_PARTY.md`.
- Bumped the route-helper browser cache key so an older JS file cannot reintroduce this fault after installation. Added an end-to-end JavaScript regression for a locally returned walking route, negative guards against walking GPS follow and static icon serving checks.
- Repaired the **shared header on every non-map page**, including Emergency, Analysis, Spectrum, Messages, Radio, and Hardware: the existing in-page heading and description are the visible title, while the top utility row no longer repeats the title. The device-local clock sits in the utility flow alongside the status/shortcut controls instead of overlapping the middle status badges. Full-screen Map's overlay header is unchanged; keyboard menu focus now targets the visible page title.
- This fixes the client-side mistaken rejection, not an absent Valhalla container or missing pedestrian graph coverage. The user must test the actual selected route with their installed graph; no local Docker daemon or real trail/GPS access was available to verify.


## OpenRF v0.2.171 — Opt-in SDR weather sensors and rain-rate history (2026-11-21)

- Added **Wireless weather sensors · RTL-SDR** to Weather Station → Stations & Sensors. A compatible Linux-visible RTL-SDR and separately installed open-source `rtl_433` executable can decode on-demand weather broadcasts. The operator explicitly selects 433.92, 868.3 or 915 MHz and a strictly bounded 10-, 20- or 30-second **Listen** operation, with **Stop** and **Refresh status** controls. Merely visiting the page or checking status does not open the receiver; no background scan, continuous collection, RF transmission or external service is started.
- Presents actual *decoder-reported* model/ID/channel, available normalized weather measurements, optional reported battery flag and listening-window UTC, with identity/time/accuracy marked **UNVERIFIED**. Ignores unrelated radio/remote codes and measurements lacking a distinguishable decoder-reported sensor identity. An operator must select a previously created local station and explicitly **Save this sensor**; browser-supplied measurements cannot be injected as a decoded receipt, and unsaved raw receiver output is not persisted.
- Protects RTL-SDR index 0 from simultaneous use by OpenRF's **Radio Receiver**, **SDR spectrum capture** and new weather listener using a shared start lock and reciprocal running-state checks. Missing executable, absent/inaccessible SDR, decoding failures, timeout and early stop are reported without fabricating observations. Optional tool and hardware availability are separate from compatibility proof.
- Extended the local SQLite weather archive with decoder provenance and **rain rate** (`rain_rate_mm_h`) distinct from interval rain (`rain_interval_mm`); rtl_433's cumulative `rain_mm` counter is deliberately *not* treated as interval rainfall. Preserves prior records via transactional v0.2.170 migration, enables multiple distinct sensors in one station/UTC second, and extends manual/WeeWX CSV input and history chart/export to the new field.
- Added parser, bounded lifecycle, selected-save/receipt, HTTP/conflict, historical migration and JavaScript control tests. **508 Python tests and 138 JavaScript suites passed locally**, with compilation/syntax validation. Details: `docs/RELEASE_0.2.171_TESTS.md`. **Live RTL-SDR weather decoding, WSL USB passthrough, station calibration and Pi touchscreen usability still require physical testing.**

## OpenRF v0.2.172 — Opt-in USB/ESP32 weather bridge (2026-11-21)

- Added a separate **Wired weather sensors · USB / ESP32** panel under Weather Station → Stations & Sensors. The operator explicitly **Refreshes Linux ports**, chooses one, **Probes** the `openrf.weather.serial.v1` protocol, and optionally **Reads one snapshot**. Port inventory never opens a serial device or assumes compatibility. The selected port opens only for a bounded 115200-baud handshake/snapshot and closes after the operation. No automatic pairing, network/radio transmission, sensor scan, background polling or auto-save.
- Introduced a strict, documented, open-source **OpenRF Weather Serial v1** JSON command protocol for user-programmed USB serial weather bridges: bounded source/hardware IDs, explicit WEATHER capability, up to 16 identified sensor readings with canonical SI field names, host UTC receipt, optional firmware-reported UTC/measurement age, unverified freshness and a >120-second stale marker. The interface is not marketed as universal proprietary USB compatibility. The browser can save only a selected server-held, expiring candidate receipt; no browser-fabricated measurements are accepted as hardware readings.
- Ensured weather probes/snapshots do not open ports claimed by **Meshtastic**, **MeshCore** or **Reticulum RNode**; the existing OpenRF USB sensor lock also prevents simultaneous serial sensor exchanges. The hardware registry reports Weather Serial support as **port visible, identity unverified**, never as a confirmed connected sensor.
- Included **optional experimental ESP32-S3 + BME280 Arduino source** for on-demand temperature/humidity/pressure readings. Hardware wiring, Arduino-ESP32 build, Adafruit BME280 library and physical sensor accuracy are **not verified**. It does not measure wind, rain, UV, GPS or other sensor values without separate hardware/firmware work.
- Added a transactional v0.2.171→v0.2.172 weather SQLite migration retaining existing records, new `OPENRF_SERIAL_WEATHER_REPORTED` provenance, per-reading host/device timing and freshness metadata in history/CSV. Existing Ecowitt/WeeWX, rtl_433, manual history and all other OpenRF features remain independent. Added strict mock decoder, serial-port, receipt, migration, API conflict and UI tests.
- Reviewed the user's GitHub Actions log: **three CI failures expected stale v0.2.169 strings** in app-settings, Reticulum asset and weather script tests, while the served code was v0.2.171. These checks now derive/assert the actual backend version; a centralized JavaScript regression test checks UI cache keys against version metadata. This addresses the observed assertion mismatch, not a hardware fault. See `docs/RELEASE_0.2.172_TESTS.md` for test results and remaining physical checks.
- Bundled the project's existing **GPL-3.0-or-later** choice as a complete standard GNU GPLv3 `LICENSE` text, matching the user's prior GitHub licensing commits. Optional/third-party component licenses are separate.
- **516 Python tests and 139 JavaScript suites passed locally**, plus Python compilation and JavaScript syntax checks. Only firmware/hardware and actual post-push GitHub Actions validation remain unverified.

## OpenRF v0.2.173 — Explicit weather recording and session history (2026-11-21)

- Added **Start recording / Stop recording** to the Weather Station dashboard: a user-selected Ecowitt RFC1918 gateway or a precise USB/ESP32 Weather Serial v1 sensor ID/channel, with 60, 120, 300, 600 or 900 second interval. No recording begins at startup/page load, no auto-resume after app restart, and no transmission or automatic rtl_433 SDR listening. Existing manual, imported, Ecowitt, SDR and USB on-demand actions are unchanged.
- Added a single bounded background weather worker (max 72 hours/5,000 saved samples per session, three consecutive failure stop). Refuses an overlapping recording; uses the existing messaging/serial ownership locks for each USB snapshot. Skips stale/unknown-age/clock-skewed USB readings and identical device UTC timestamps. Gateway reports remain explicitly unverified, including freshness.
- Added local SQLite weather recording sessions with persistent time range, source/interval, counts, error reasons and clean/interrupted/limited termination states. Migration retains existing weather readings and adds an optional per-reading `recording_session_id` included in CSV exports and accepted (as non-authoritative metadata) by CSV reimports. The session-history UI shows the last 20 records without any background hardware probe.
- Reconfirmed the v0.2.172 fix to old v0.2.169 GitHub Actions assertion expectations; tests and frontend cache keys follow current v0.2.173 packaging. See `docs/RELEASE_0.2.173_TESTS.md` for local test results and physical-verification limits.
- **522 Python tests and 139 JavaScript suites passed locally**, including synthetic weather recorder start/stop, SQLite interruption recovery, exact USB selection, stale/duplicate suppression and MeshCore USB contention tests. Hardware and remote GitHub CI are unverified.

## OpenRF v0.2.174 — Weather history comparisons, sidebar active-page visibility (2026-11-21)

- Updated the existing page restoration logic so the sidebar's *own* scroll area reveals the selected page on refresh. Also adjusts the compact/drawer navigation when it opens. Selection no longer requires manually scrolling back down to Weather Station; the document itself is not scrolled to the sidebar. Added desktop, 7-inch style and compact sidebar scrolling regression tests.
- Moved **Weather Recording** to the bottom of the Weather Dashboard, below the temperature/wind/humidity/rain cards and their provenance note, without removing any of the v0.2.173 recording capabilities.
- Added an optional saved-weather period comparison on History: two adjacent, equally long UTC windows (1, 7, 30 or 365 days) with sample count, arithmetic average, minimum and maximum for the selected SI weather metric. Show source-appropriate display units, absolute mean difference and no-data states; exclude missing samples. This is local SQLite aggregation only. Results are not sensor-calibrated, not forecasts, and rainfall is per observation—not total precipitation.
- Preserved the existing MeshCore/Reticulum/Meshtastic, navigation, map, radio, privacy, recorder, export and source history functions. Tests and release versions updated to v0.2.174. See `docs/RELEASE_0.2.174_TESTS.md` for reproducible checks and unverified field hardware.
- **525 Python tests and 140 JavaScript suites passed locally**. No physical sensor samples, GPIO/serial permissions, touchscreen visual QA or post-update GitHub Actions outcome were verified.

## OpenRF v0.2.175 — Weather freshness and opt-in local alerts (2026-11-22)

- Show the age of the selected station's last saved weather observation, calculated against the local OpenRF server UTC clock. Explicitly distinguish archival recency from actual live-sensor health. The user-selectable stale age defaults to 30 minutes and can be 5, 15, 30, 60 or 120 minutes.
- Add optional local, per-station threshold warnings for low/high temperature, high wind gust and high rain rate. Settings use familiar display units, are converted to SI for storage in a small SQLite table and remain disabled unless the operator explicitly enables and saves them. No sensor reads or background notification service are started by this setting.
- Threshold warnings evaluate only the most recent source-reported saved reading from the exact still-running recording session for the selected station, with a recent receipt. Manual/IMPORTED, previous-session, one-shot, stale or unknown-age USB samples cannot trigger measurement alarms. Ecowitt timestamps are host receipt times; source identity, device freshness and calibration are not independently verified.
- Weather Recording remains below the metric cards and local alerts. The Weather History comparison, local exports, existing MeshCore/Reticulum/Meshtastic, map and other functions are preserved. Added Python storage/HTTP and simulated browser regression tests; see `docs/RELEASE_0.2.175_TESTS.md` for validation and hardware limits.
- **529 Python tests and 140 JavaScript suites passed locally**, including a new version-metadata consistency test to detect the kind of partial Git staging that failed earlier Linux CI. GitHub Actions for this new release and physical weather hardware remain unverified.

## OpenRF v0.2.176 — Weather session CSV export and local WSL preflight (2026-11-22)

- Added a **per-session Export CSV** button under Weather Station → History → Recording sessions. The new local read-only `GET /api/weather/recording/export.csv?session_id=N` endpoint validates a single positive session ID, reads only that session's saved readings from SQLite (up to the recorder's 5,000-sample cap), and preserves station, source/provenance, UTC timestamps, normalized SI fields, freshness and session ID in the existing CSV schema. Other recording sessions and manual/imported records are excluded. Failed/empty sessions produce header-only CSV; no device contact or recording start is triggered by export.
- Added `tools/Test-OpenRF.ps1` and `tools/test-openrf-linux.sh` inside the managed project ZIP. They run the same local Python, shell and Node/JavaScript suites as the GitHub Linux workflow, using the WSL default Python or an explicitly installed `python3.11` / `python3.14`, without committing, pushing, modifying GitHub Actions triggers or deliberately contacting radio/weather devices. These scripts avoid a second manual installer or extra GitHub build to perform local preflight.
- Preserved the v0.2.175 opt-in alert/freshness gates, 0.2.174 comparison/history/sidebar adjustments, source-labeled recording and all map/radio/mesh features. Added isolated SQLite/API/DOM and launcher drift tests. **536 Python tests, 140 JavaScript suites, syntax checks and the Bash local preflight passed** using Python 3.12 and Node 24 in Linux. See `docs/RELEASE_0.2.176_TESTS.md` for unverified physical/Windows PowerShell limits.

## OpenRF v0.2.177 — Native Debian build/validation workflow (2026-11-22)

- Added the local, version-gated `tools/build-openrf-deb.sh` and Windows WSL launcher `tools/Build-OpenRF-Deb.ps1`. The builder runs Python/JavaScript regression checks, installs the locked Electron build dependencies, builds one or both architecture-specific Debian files, then validates each `.deb` using the read-only `dpkg-deb` inventory/metadata verifier. Neither command installs the packages or touches Git/GitHub Actions.
- Fixed desktop packaging metadata to `GPL-3.0-or-later`, PrivilegedUSA project identity and the actual GitHub repository. The `.deb` now includes GPL LICENSE and COPYRIGHT alongside the Python app. Debian GTK/accessibility/ALSA dependencies now accept classic or `t64` package names to cover older and newer distro releases. No public email address was fabricated.
- Excluded generated Electron `node_modules`, Windows backups, `dist` and release build folders from complete updater source ZIPs so a local Debian build cannot accidentally add Chromium binaries to Git staging/install payloads. Added source, negative verifier and synthetic ZIP tests.
- Preserved the v0.2.176 Weather Hub milestone, offline loopback, optional kiosk toggle and local data persistence. **539 Python tests and 140 JS suites passed** in the Linux development container; AMD64 and ARM64 `.deb` builds and read-only package inspections also passed. They do not substitute for installed AMD64/ARM64 desktop operation or Pi 1280×800 touchscreen hardware. See `docs/RELEASE_0.2.177_TESTS.md`.

