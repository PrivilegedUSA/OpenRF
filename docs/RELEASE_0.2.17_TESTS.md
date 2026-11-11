# OpenRF v0.2.17 — Historical signal comparisons

## Changed files

- `openrf/static/history-analysis.js` (new) — offline, read-only comparison engine; source/device/hardware/frequency/unit-aware grouping and median/range comparisons.
- `openrf/static/app.js` — comparison UI data flow and private CSV export with spreadsheet formula escaping.
- `openrf/static/index.html`, `openrf/static/app.css` — collapsed, touchscreen-friendly comparison controls in Analysis.
- `openrf/server.py` — explicit same-origin allowlisting of the new static JS asset, no new API endpoints.
- `tests/test_history_analysis.js` (new) — deterministic tests for grouping, demo segregation, session/time comparisons, missing values, timestamps, provenance and location warnings.
- `tests/test_frontend.js`, `tests/test_server.py`, `.github/workflows/openrf-linux.yml` — UI/static-serving regression checks and new Node test execution in Linux CI.
- `openrf/__init__.py`, `README.md`, `CHANGELOG.md`, `openrf/static/index.html`, this guide, ZIP-root `openrf-bundle.json` — release metadata/docs.

## Tests

Run from `/mnt/c/projects/OpenRF` (Ubuntu):

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -v
node --check openrf/static/app.js
node --check openrf/static/history-analysis.js
node tests/test_frontend.js
node tests/test_history_analysis.js
```

## Firefox checks

1. Put `OpenRF-v0.2.17.zip` in Windows Downloads, stop the old server using Ctrl+C, and install via PowerShell:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

2. Restart with Ubuntu: `cd /mnt/c/projects/OpenRF && python3 -m openrf`. Open http://localhost:8765, hard reload Ctrl+F5.
3. Go to **Analysis → Compare saved signal history**. It should be collapsed by default and expand without changing or starting any RF scan.
4. With no saved signal series, verify the explanation is visible and CSV export is disabled. You can use **Load synthetic test records** on Overview for a clearly labeled DEMO-only exercise.
5. Enable **Include SYNTHETIC DEMO / HISTORICAL readings**, choose a series with 2 or more stored readings, and verify two time groups, units and median difference. Re-disable demo and ensure the synthetic choices disappear. Never expect an empty real-data view to fabricate live readings.
6. In **Two investigation sessions**, select different existing sessions containing comparable readings (same identifier, device, frequency and unit). Without matching samples, a clear unavailable message should appear; disabled export is expected.
7. With a valid comparison, choose **Export comparison CSV**. Verify baseline/follow-up labels, original observation IDs/time/source/source device/hardware ID/coordinates, original unit and values. This is a private file; it may contain GPS data.
8. Confirm the saved-data explorer and full CSV/GeoJSON exports still work. Check the map's U.S. overview and smooth location movement, if you allow browser geolocation.

## Current limits

- Comparison is purely descriptive, not a live RF scan, transmitter tracker, signal-to-distance estimator, or proof that a source changed location or power.
- A source/receiver-provenance label is metadata, not cryptographically authenticated hardware identity. Manually entered or imported measurements cannot be verified from their numbers alone.
- The app loads up to the latest 10,000 saved observations from its existing endpoint. Very large histories may be incomplete, and recorded timestamps can be host retrieval times rather than true signal measurement instants.
- Different survey locations, antenna orientation, calibration and scan freshness can explain RSSI/quality variation. Location notes are not an RF source-position estimate.
- No new SQLite migration, third-party runtime dependencies, background scanning, uploads or public map downloads. Actual Firefox UX and physical Raspberry Pi/ESP32/SDR hardware behavior need operator testing.
