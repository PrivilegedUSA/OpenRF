# OpenRF v0.2.44 — Hardware connection overview / test guide

## Change summary

This patch adds `openrf/hardware_manager.py` as an explicit, read-only connection-state contract. `/api/hardware/manager` returns a UI-safe overview of Linux Wi-Fi, BlueZ, OpenRF Serial v1, SDR CSV, external GNSS, and planned specialized receivers. It contains no USB serial numbers, MAC addresses, SSIDs, GPS fixes, hardware IDs or personal investigation records. Existing `/api/hardware` and `/api/hardware/readiness` remain unchanged. Hardware page gets a compact view of statuses/evidence/next steps. Refresh re-fetches this view along with existing diagnostics. No database migrations or mandatory extra dependencies.

### State semantics

- `prerequisites_visible` = Linux control prerequisites detected; one-shot retrieval **not verified**.
- `detected_unverified` = a USB serial port exists; hardware firmware, access and receiver function unverified.
- `responded_recently_unverified` = a prior **user-started** OpenRF Serial v1 handshake received a reply within five minutes, not proof of RF samples or physical identity.
- `probe_failed`, `permission_denied`, `stale`, `disconnected` identify specific USB failures; no automatic retries.
- `offline_analysis_only` = existing historical `rtl_power` CSV viewer; **no live SDR**.
- `tools_only_unverified`, `not_connected`, `unsupported_current_host`, `missing_prerequisites`, `driver_unavailable`, `not_implemented` distinguish missing parts without claiming RF coverage.

## Automated tests (source checkout in Ubuntu/WSL)

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for t in tests/*.js; do node "$t"; done
node --check openrf/static/app.js
bash -n tools/setup-valhalla-wsl.sh
```

Expected results when built from this bundle: **174 Python tests, 23 JavaScript suites**. State-level tests cover no-WSL-interface, ready-on-demand prerequisites, USB port permissions, recent failed/responding handshakes, stale/future and disconnected reports, GNSS/SDR executable presence, explicitly unimplemented receivers and timestamp validation. HTTP regression tests exercise the new endpoint without an RF action. Frontend tests verify existing map/survey links and escaped, responsive overview output.

## Manual follow-up tests (not run in the packaging environment)

1. Install using `Update-OpenRF.ps1`; restart the Python server and hard-refresh the browser to load `?v=0.2.44` static files.
2. Hardware → Connection overview: without a Linux-visible radio, confirm statuses report missing/unsupported, not "connected" or invented detection counts. Refresh again; no scan should start.
3. On a Raspberry Pi/Linux host with a compatible Wi-Fi/BLE interface, verify prerequisites show **visible**, not a verified scan. Existing explicit one-shot scan buttons should remain optional.
4. On WSL with USB passthrough of a known authorized OpenRF Serial v1 module, test permission denied and manual probe. A recent response should become stale after five minutes and disappear when its port vanishes. This UI does **not** auto-probe devices.
5. Verify Spectrum continues to label rtl_power CSV as offline and synthetic sample as **DEMO**. Read-only SDR status never claims a connected HackRF/RTL-SDR.
6. Check 800×480 layout, map controls, cached MBTiles, navigation, local data and map attribution in Firefox or on the target Pi touchscreen. No map files should be deleted by this update.

## Changed files

- `openrf/hardware_manager.py` (new normalized contract).
- `openrf/server.py` (read-only endpoint).
- `openrf/static/index.html`, `openrf/static/app.js`, `openrf/static/app.css` (hardware overview; refresh wiring; versioned assets).
- `openrf/__init__.py` (version).
- `tests/test_hardware_manager_v044.py`, `tests/test_hardware_manager_v044.js` (new), `tests/test_server.py`, `tests/test_manual_location_frontend.js` and current-version cache assertions in existing tests.
- `README.md`, `CHANGELOG.md`, this document.

## Limits

No physical RTL-SDR, HackRF, ESP32, BlueZ/Wi-Fi adapter, GNSS or Raspberry Pi field instrumentation was connected during packaging. Python/JS tests cannot establish real receiver compatibility, accuracy or actual touchscreen usability. Existing source records remain private on your PC; this ZIP contains no live SQLite or sensor records. A successful local test or GitHub push is **not** proof of GitHub CI success. No frequencies, location estimates, signal strengths, sensor coverage or live receiver claims have been invented.
