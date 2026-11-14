# OpenRF v0.2.54 — validation and field checklist

## Installed foundation

- Source: full v0.2.53 managed bundle, additive database tables; previous observations and private files untouched.
- New: source-labeled, separately toggled ALPR/red-light/speed map layers; optional area-limited FlockHopper/DeFlock community-map import; manual entries; CHIRP CSV radio profiles (import only).
- Independent evidence states: `REPORTED`, `COMMUNITY_MAPPED`, `VERIFIED` (manually asserted with document URL), `REMOVED`. Camera pins are not live RF measurements.

## Automated checks

Run from the extracted bundle's `project/` folder:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -q
for t in tests/*.js; do node "$t" || exit 1; done
python3 -m compileall -q openrf
for f in openrf/static/*.js; do node --check "$f" || exit 1; done
```

HTTP tests use a local ephemeral port and mock the public feed; no external request or real GPS reading is generated. Manual static Chromium snapshots at 800×480, 390×844 and 1450×900 verify camera-manager and Radio form appearance but cannot verify the live MapLibre/raster interaction because browser networking to the loopback test server was blocked. Actual feed format/response, network availability, CHIRP hardware downloads, WSL USB passthrough, receiver audio, Raspberry Pi hardware, public internet, and CI runs remain **unverified**.

## User testing

1. Download bundle to Windows Downloads; run the Windows updater with OpenRF stopped. Start backend in Ubuntu and refresh browser (`http://localhost:8765`).
2. Map → Layers → Traffic cameras: all categories should be OFF initially. Turn on ALPR; the layer should show none until your private catalog has entries. Add a manually sourced pin for test, verify color and map display; remove by private API if necessary. Do not mark a report `VERIFIED` without an independent documentary source URL.
3. Zoom into a specific area smaller than 8°×8° and click **Import DeFlock/OSM ALPRs in visible area** *only if you want the online download*. Verify returned status and source attribution; no locations are automatically confirmed, and other two categories remain separate. Without internet, previous imported entries remain in SQLite.
4. Export a **CHIRP CSV** with the existing cable/CHIRP on Windows; Radio → My Baofeng channel lists → import. Confirm mode/offset/frequencies, that the radio is not written to, and that copying to RTL-SDR only fills the tuner form.
5. Recheck 800×480 Map default, right-side tools, offline maps, navigation, spectrum and saved investigations. Report any regressions.

## Boundaries and caveats

- ALPR provider feed is community-sourced, may include outdated/incorrect locations, and may become inaccessible. Offline import does not imply real-time updates. No claim of GPS or camera validation.
- No automatic network calls, camera-avoidance routing, enforcement alerts, station identification, PTT or two-way transceiver use.
- Data source credentials and private coordinates not included in the release. Private SQLite tables are additive and do not modify existing investigation tables.
