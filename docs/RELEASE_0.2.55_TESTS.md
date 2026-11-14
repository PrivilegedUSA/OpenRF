# OpenRF v0.2.55 — ALPR import and unified map layers

## Release scope

This release is a narrow follow-up to **v0.2.54**. It does not change the v0.2.52 right-side map control layout, navigation routing, radio, SDR, GPS behavior, databases other than adding persisted imported camera rows to the existing `camera_sites` table, or offline map resources.

### Changes

- Fix the import's architectural cause of `ALPR feed is too large; import cancelled`: **stop fetching a complete national FlockHopper daily snapshot**. On explicit click, perform a bounded OpenStreetMap **Overpass** POST query for `man_made=surveillance` and `surveillance:type=ALPR` in the visible bounds only. Nodes use stored OSM coordinates; ways use the center reported by Overpass and are not precise lens positions. Two fixed public Overpass hosts; bounded 8°×8° extent, 12 MiB response and 20,000 element safety checks, timeouts and errors. Never accept arbitrary fetch URLs from the browser.
- Carry OSM node/way IDs and source URLs for new imported records, deduplicate by source ID, and retain `COMMUNITY_MAPPED`, not `VERIFIED`. Do not infer a camera make unless recorded in OSM tags. Empty external results are shown as no *tagged* results, not no actual cameras. Existing private manual/previously imported records are preserved; no migration required.
- **Privacy:** The chosen visible-map bounding rectangle is sent to the external Overpass service **only when Import is clicked**. This may indirectly describe the area the user is viewing. No GPS fix, personal travel history or RF scan data is sent. Offline map browsing and saved camera pins remain local.
- Move ALPR/Flock, red-light enforcement and speed enforcement toggles into the **same two-column style and layer grid** as Wi-Fi/BLE/RF/cellular/infrastructure/manual. Remove the second camera accordion; its actions and manual-entry disclosure are visible below the shared grid. Space Reload and Import buttons for the 5-inch touchscreen.
- Preserve map navigation, camera pin colors, backend API contracts, imported/investigation data, and CHIRP CSV radio profiles.

## Tests run

From the release's `project/` directory:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -q
for t in tests/*.js; do node "$t" || exit 1; done
python3 -m compileall -q openrf
for f in openrf/static/*.js; do node --check "$f" || exit 1; done
```

The new tests use **fixed synthetic** OSM elements: bounded query parameters, parsing, node/way source links, SQLite persistence/deduplication, empty results, bad/timeout responses, offline provider failure, and the local API POST → GET cycle. UI checks inspect the shared grid and button spacing. The isolated Chromium layout was checked at 800×480, 390×844, and 480×320, with no horizontal overflow. The environment blocked Chromium access to the local HTTP test server, so the browser check does **not** establish a working in-browser live map. No real ALPR map import, external Overpass response, GPS fix, driving reroute, physical hardware, or GitHub CI execution has been verified.

## User acceptance checklist

1. Stop OpenRF; install the v0.2.55 ZIP using the Windows PowerShell updater, then restart in WSL. Browser refresh at `http://localhost:8765`.
2. Open **Map → Layers**. Nine checkboxes should appear in one grid. ALPR, red-light and speed all start off, independent from wireless observations.
3. Zoom to a neighborhood or a town, enable **ALPR / Flock**, then choose **Import OSM / DeFlock ALPRs in view (online)**. It sends the viewport bounds to Overpass on explicit click and saves successfully returned OSM-tagged entries to local SQLite. If none are tagged, the app should say zero, not fabricate a camera. If online import fails, the app should display the provider error and preserve saved pins. Public Overpass servers can throttle, time out, or change behavior; retry a smaller area if needed.
4. Verify **Reload saved area** without an internet connection and pan/zoom to previously downloaded points. Colors remain distinct by type. Previously saved entries may have different legacy source URL attribution from v0.2.54.
5. Verify maps/controls, offline basemap, saved surveys and existing Radio/CHIRP pages. Check address navigation unchanged.

## Deferred work

No camera-alert or camera-avoidance navigation has been added yet. A future route comparison must use valid routed road geometries, distinguish ALPR vs red-light vs speed cameras, account for stale/unverified reports and direction of travel (where known), and never imply that a camera location is verified by RF reception or that a camera-free route is guaranteed.
