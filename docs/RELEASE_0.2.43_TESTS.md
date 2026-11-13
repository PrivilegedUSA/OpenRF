# OpenRF 0.2.43 — Field survey workflow / test guide

**Software platform:** Python 3.11+ standard library; local SQLite and HTTP API; JavaScript browser UI. Built from the complete v0.2.42 ZIP, retaining all prior managed files. No Android APK build.

## Implemented

- New **Sessions** field survey planner (`receiver_plan`, `site_label`, `objective`, `field_notes`). Receiver choices are *intent only*; not proof that hardware exists or that any radio is operating. Prior sessions are retained by additive SQLite migration, planned receiver `UNASSIGNED`.
- Editable plan is permitted only while its session is ACTIVE. Other session evidence and hardware fields remain untouched. Old behavior of marking a running investigation INTERRUPTED at server restart is retained; an interrupted session is not silently resumed.
- Active-session panel and history summaries show exact saved-observation counts, saved SENSOR counts, non-DEMO observations with observer coordinates, scan-snapshot counts, manual-waypoint counts and DEMO counts. No live sensor scan, GPS polling or data collection occurs from viewing these controls.
- Receiver workspace shortcut opens an existing page; it never calls a sensor acquisition endpoint. Saving a Wi-Fi/BLE/USB observation/snapshot remains opt-in and links to the ACTIVE investigation, not to the planned receiver type. The offline SDR CSV viewer remains browser-only and is not saved as RF evidence.
- Historical report HTML/JSON includes planned receiver and context, HTML-escaped, with a warning that it is not verified hardware evidence. Coordinates still excluded by default in reports.

## Local tests run (from fresh ZIP extraction)

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for t in tests/*.js; do node "$t"; done
bash -n tools/setup-valhalla-wsl.sh
```

Expected software-regression counts: **167 Python tests, 22 JavaScript suites**. This includes `test_field_surveys_v043.py` (migration, validation, exact counts, report privacy, API lifecycle) and `test_field_surveys_v043.js` (receiver options, compact survey UI, workflow links). The build/package script also checks the release manifest, the retained file set and unchanged offline map resources/Android archive.

## Manual interactive checks (not claimed as completed)

1. Install via existing Windows updater; stop previous server, start `python3 -m openrf`, hard-refresh the browser.
2. Sessions → Start field survey, create a plan with Linux Wi-Fi and a short objective. Confirm the active panel shows 0 saved readings. Merely creating a plan must not perform a Wi-Fi scan or record any browser GPS.
3. Tap Open receiver workspace: it should open Analysis, not automatically press Scan. On WSL without Linux radio support, status should be **unavailable**, not zero devices detected.
4. Switch the plan to Offline SDR CSV via Edit; verify that no old observation changes and the shortcut opens Spectrum. A synthetic demo is marked DEMO and is not a verified live reading.
5. Save a *manual* observation with a session active; verify the count and manual evidence label; do not invent receiver values. Stop session and inspect history and its report. Plan receiver text and notes should be present but identified as a plan. Precise coordinates should be excluded unless explicitly selected.
6. Restart the server during an active survey and confirm it becomes INTERRUPTED; no background collection resumes.
7. Check the 800×480 map and Sessions layout in actual Firefox/device; the map gear, offline tiles, navigation and existing panels must remain usable.

## Changed files

- `openrf/storage.py`: session plan validation, additive migration, evidence aggregate counts, update methods.
- `openrf/server.py`: validated create/update session routes.
- `openrf/reports.py`: historical report plan context and limitations.
- `openrf/static/index.html`, `openrf/static/app.js`, `openrf/static/app.css`: planner/dashboard, active-session workflow, cache/version UI.
- `openrf/__init__.py`, `README.md`, `CHANGELOG.md`: release version and details.
- `tests/test_field_surveys_v043.py`, `tests/test_field_surveys_v043.js`: new regression coverage; prior tests updated for cache-version label.

## Unverified / remaining limits

No physical RTL-SDR, Linux BLE controller, Wi-Fi adapter, serial sensor, moving GNSS, or Raspberry Pi tested in this environment. No physical hardware capture is implemented for the SDR viewer; frontend tests and HTTP tests cannot establish actual radio receiver compatibility or screen usability in Firefox. CI push/run status cannot be determined locally. The plan fields are sensitive and remain in the user's SQLite database, outside the release ZIP and Git; an exported report may include them. No RF direction/position/distance inference, passive interception, arbitrary RF transmissions or automatic upload.
