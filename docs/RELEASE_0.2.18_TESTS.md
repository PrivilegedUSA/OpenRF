# OpenRF v0.2.18 — Investigation reports

## Changed files

- `openrf/reports.py` **new**: historical report model, evidence-safe measurement summaries, standalone HTML renderer and escaping.
- `openrf/storage.py`: bounded, single-transaction, read-only investigation snapshot with optional DEMO data and exact observer coordinates; no schema changes.
- `openrf/server.py`: validated read-only HTML/JSON report endpoints on the existing loopback API.
- `openrf/static/index.html`, `openrf/static/app.js`, `openrf/static/app.css`: touchscreen-friendly report selector, privacy options, per-session Report shortcut, print preview and file downloads.
- `tests/test_reports.py`, `tests/test_reports_frontend.js` **new**: privacy, DEMO provenance, safe HTML escaping, 404/400/403, zero-result captures, unit/device separation and UI checks.
- `.github/workflows/openrf-linux.yml`: run the additional Node report checks on CI.
- `openrf/__init__.py`, `tests/test_server.py`, `README.md`, `CHANGELOG.md`, `openrf/static/index.html`, ZIP-root `openrf-bundle.json`, this guide: version metadata and release notes.

## Local tests (Ubuntu / WSL)

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -v
node --check openrf/static/app.js
node --check openrf/static/history-analysis.js
node tests/test_frontend.js
node tests/test_history_analysis.js
node tests/test_reports_frontend.js
```

## Browser verification after installing the new bundle

1. Stop the previously running OpenRF server with **Ctrl+C**.
2. Put `OpenRF-v0.2.18.zip` in Downloads, run from **Windows PowerShell**:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

3. Restart in Ubuntu:

   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```

4. Open `http://localhost:8765` in Firefox; refresh with **Ctrl+F5**. Navigate to **Sessions → Investigation report**. Create a manual test session if none exist. The report picker should show existing sessions.
5. Select a session and click **Preview / Print**. Verify a new browser tab opens with a title, historical report warning, session metadata, measurements and saved record details. Use **Ctrl+P → Save to PDF** if desired.
6. Try **Save HTML** and **Save JSON**. Check the files include only the selected session's records; both exports are locally generated and may contain sensitive notes.
7. Verify **Include synthetic DEMO** and **Include precise survey coordinates** are unchecked initially. Deliberately enable them for a test session and confirm corresponding output changes and warnings. Note that global demo fixture records loaded on Overview are normally unlinked to sessions.
8. Try an empty session; expect an honest report with no fabricated readings. Try a session with one saved zero-result capture; it should appear as a capture rather than a detection.
9. Confirm existing map, scanner, investigations, history comparisons and offline-map controls still work. No stored records should change merely because a report was exported.

## Current limitations

- Report export is *per investigation session*; unlinked observations are intentionally excluded. Existing full CSV/GeoJSON and filtered CSV exports remain available for those.
- Summaries describe saved readings, not live measurements, evidence of ownership, or RF transmitter locations. Mixed devices, frequencies, or units must not be treated as a common time series.
- Each report includes at most **5,000 observations**, **1,000 saved captures**, and **150 compatible measurement groups**, and reports truncation if exceeded; a report is not a complete archive in that case.
- DEMO and coordinates require explicit opt-in. Raw identifiers and manually typed notes may still reveal private information even if coordinates are hidden; inspect before sharing.
- HTML is print-ready without external dependencies and can be saved locally or printed to PDF in Firefox. The application does not implement a PDF engine or unattended printer integration.
- Python/JS tests are automated; printed PDF layout, Firefox behavior, Raspberry Pi operation and real RF receiver measurements have not been physically verified here.
