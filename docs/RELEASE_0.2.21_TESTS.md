# OpenRF v0.2.21 — Hardware readiness and map controls

## Changes

- Read-only `openrf/readiness.py` evaluates host inventory and prior operator-requested scan/probe results. It never opens ports or initiates scanning. Distinguish `not_connected`, `permission_denied`, `ready_to_probe`, `disconnected`, `stale`, `probe_failed`, `responding_unverified` and `not_implemented` from real receiver verification.
- `GET /api/hardware/readiness` reports coarse host diagnostics and avoids exporting identifiers or precise GPS. **Refresh hardware** refreshes inventory and diagnostics together.
- On the Survey Map, a compact 44px **stacked-layers** button is at bottom-right and a 44px **+** button immediately left of it opens the existing Add observation form with blank location fields. Tapping the map itself still opens the form with clicked observer coordinates.
- Bottom-of-map manual entry button and GPS waypoint details are visually separated by 18px.
- Existing private SQLite observations, sessions, survey waypoints and map packages are preserved and not part of the source ZIP.

## Automated regression checks

Run from the Linux project root:

```bash
python3 -m unittest discover -s tests
node --check openrf/static/app.js
node tests/test_frontend.js
node tests/test_history_analysis.js
node tests/test_signal_explorer.js
node tests/test_reports_frontend.js
node tests/test_readiness_frontend.js
```

- `tests/test_readiness.py` covers missing hardware, Wi-Fi prerequisites, USB permissions, recent/stale/disconnected probes, future timestamps and privacy of exported diagnostics.
- `tests/test_readiness_frontend.js` covers checklist/refresh behavior and small-screen map controls. Static frontend regression tests do **not** replace Firefox interaction checks.

## Local operator test on Windows/WSL (not verified here)

1. Put `OpenRF-v0.2.21.zip` in Downloads. Stop a running OpenRF server with Ctrl+C.
2. In Windows PowerShell: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`.
3. In Ubuntu/WSL: `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
4. Visit http://localhost:8765, Ctrl+F5. On Map verify the compact stacked-layers icon at the lower-right and + button to its left. Tap +: the observation form should open with empty coordinates. Close it, then tap an actual map point: this should prefill that point's coordinates.
5. Check the spacing between Add observation manually and GPS-linked survey waypoints on the five-inch layout.
6. On Hardware, view the readiness checklist and click Refresh hardware. With no supported device connected, entries must remain **unavailable/unverified**, never simulated. Try Export readiness JSON and verify it contains no raw scans, hardware IDs, SSIDs or coordinates. Check status again after an actual hardware disconnect, if available.
7. Confirm old observations, sessions, reports and waypoints remain intact. The new code does not migrate or delete the database.

## Limitations

No real USB/ESP32/RF device or Raspberry Pi was tested here. Inventory and a previous successful probe are not proof of present capability. Bluetooth, SDR, long-range radar and navigation remain future hardware/software work. Firefox visual/touch behavior should be tested locally.
