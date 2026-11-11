# OpenRF v0.2.19 — Advanced signal-history explorer

## Changed files

- `openrf/static/history-analysis.js`: pure historical window selection, bounded min/max rendering samples, warnings, privacy-preserving time-series CSV.
- `openrf/static/app.js`, `openrf/static/index.html`, `openrf/static/app.css`: source-aware chart, readable statistics, time windows, latest readings and CSV/DEMO/coordinate controls.
- `tests/test_signal_explorer.js`: new unit/DOM contract tests for window anchoring, grouping, extreme point retention, identical timestamps, opt-in DEMO/coordinates and CSV formula mitigation.
- `tests/test_frontend.js`: replace obsolete identifier-plot assertion with compatible-series assertion.
- `.github/workflows/openrf-linux.yml`: includes the new test in Linux CI.
- `openrf/__init__.py`, `openrf/static/index.html`, `tests/test_server.py`, `README.md`, `CHANGELOG.md`, ZIP-root manifest and this file: version release notes.

## Verify locally in WSL

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -v
node --check openrf/static/app.js
node --check openrf/static/history-analysis.js
node tests/test_frontend.js
node tests/test_history_analysis.js
node tests/test_signal_explorer.js
node tests/test_reports_frontend.js
```

## Test in Firefox

1. Stop the running OpenRF server with Ctrl+C. Put `OpenRF-v0.2.19.zip` in Downloads, then in **PowerShell** run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`.
2. In **Ubuntu**, run `cd /mnt/c/projects/OpenRF && python3 -m openrf`. Open `http://localhost:8765` in Firefox and refresh with Ctrl+F5.
3. Open **Analysis → Signal history**. Without data, see an honest empty state; no fake live measurements should appear. Save at least two manual wireless observations sharing an identifier and frequency, or opt into the clearly marked DEMO fixtures to inspect a graph.
4. Choose a series, compare all readings versus 24h / 7d / 30d windows. Periods are anchored to that series' newest historical timestamp, *not* the current date. Confirm min/median/max/count and recent readings change as expected.
5. Compare the graph's selector against the existing **Compare saved signal history** tool. Two receivers, frequencies, sources or dBm versus % quality should remain separate.
6. Export the selected series as CSV. With **Include precise observer coordinates** unchecked, verify latitude/longitude and accuracy columns are absent. Check it and explicitly export again; columns should be present for saved observer coordinates. Beware manually supplied identifiers and device names may contain sensitive text.
7. Enable **Include SYNTHETIC DEMO / HISTORICAL records** only when wanted; confirm DEMO is clearly marked. Load 1000+ readings only in synthetic local tests, not as if they were live captures.
8. Check existing Wi-Fi manual snapshots, sessions, printable reports, offline map manager, and smooth GPS flyover.

## Limits and caveats

- This is a **saved historical data visualization**; it cannot detect new signals, locate transmitters, prove a Flock camera, or infer police presence. Receiver and time-provenance metadata may be incomplete or inaccurate.
- Stats and chart are bounded by the records returned from `/api/observations` (at most 10,000 of the newest entries). The graph draws a max of ~202 time-ordered points by bucketed minima/maxima; exported rows and statistics use the *entire selected window*, not just plotted points.
- Time-series export deliberately omits general notes, labels and GPS unless opted in, but identifiers/device names may still be sensitive. Review files before sharing.
- No new system packages, DB migration, network collection, background scan, firmware change, radar integration or navigation routing in this patch.
- Unit/contract tests ran locally; real Firefox rendering, Raspberry Pi device behavior and physical sensor readings remain unverified until tested on the target environment.
