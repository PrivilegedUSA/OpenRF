# OpenRF v0.2.16 — Saved Observations Explorer

## Changed managed files

- `openrf/static/index.html` — new optional Saved filters and filtered-export button; version label.
- `openrf/static/app.js` — safe local filtering by source/session/recorded age/coordinates, stable sorting, CSV output with provenance, and session shortcut behavior.
- `openrf/static/app.css` — collapsible mobile-friendly filter controls.
- `tests/test_frontend.js` — browser-independent filtering, source visibility and CSV escaping tests.
- `openrf/__init__.py`, `tests/test_server.py`, `README.md`, `CHANGELOG.md`, this document, and ZIP-root `openrf-bundle.json` — version and notes.

## Automated verification

Run from the project source directory in Ubuntu:

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -v
node --check openrf/static/app.js
node tests/test_frontend.js
```

## Manual Firefox smoke test

1. Download `OpenRF-v0.2.16.zip` to Windows Downloads. Stop the running server, then install using the existing updater: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`.
2. Restart via Ubuntu: `cd /mnt/c/projects/OpenRF && python3 -m openrf`, open `http://localhost:8765`, and refresh with Ctrl+F5.
3. In Saved, verify search/category/demo still work. Open **More filters**, select source, session, and mapped only; try past 7 days and Oldest first. Confirm counts update and no data changes.
4. From Investigations, click Records for one session; Saved should filter to that session with the advanced filters expanded. Clear filters should show all available non-DEMO records again.
5. With at least one matching saved record, press **Export shown CSV**. Confirm only matching IDs appear and source/device/units are present. The existing overview CSV/GeoJSON exports should still work.
6. Clear filters, then enable Include demo (only if you intentionally loaded DEMO data). Check that DEMO records display clearly marked. Disable it and verify they disappear, including from filtered exports.
7. Recheck initial U.S. map view and browser location smooth transition; scanner and hardware screens should still load.

## Limitations

No sensor has been physically connected in these tests. Actual Firefox UI interaction must be tested by the user. Age filtering uses the browser time, not a synchronized hardware clock. The existing `GET /api/observations` endpoint limits browsing to the most recent 10,000 records; full exports are unaffected. This release does not add live RF scanning, police radar detection, routing, or vehicle-location reporting. Local filtered exports may contain private GPS coordinates; store or share them carefully.
