# OpenRF v0.2.141 — Fix Emergency tab regression and missing GPS follow asset

Release ZIP root: `openrf-bundle.json` = `{"project":"OpenRF","formatVersion":1,"version":"0.2.141"}`. Installable source stays under `project/`; the Windows updater, `.git/`, `.openrf-state/`, credentials, `local-data/`, private SQLite files and signing keys are excluded.

## Root cause of screenshot regression

OpenRF's loopback server deliberately serves only an approved set of static files. v0.2.140 added script tags for `emergency-tabs.js` and `breadcrumb_follow.js` but neglected their names in that allowlist. The browser rendered five default-looking tab buttons, while HTTP 404 for the tab script left all Emergency panels in their old order. The same 404 prevented starting live reverse-track geometry checks.

**Repair:** Add the two explicit, known script paths to the server allowlist. They now return HTTP 200 and the content expected by the frontend. An arbitrary unlisted JavaScript path still returns HTTP 404. New tests call the running HTTP test server instead of merely asserting that JS source exists on disk.

## Dashboard structure at 1280×800

1. The official immediate-danger warning remains above the tabs.
2. Five individual tab buttons remain: **Dashboard**, **SOS & Check-ins**, **Radio & Messages**, **Plans & References**, and **Backup & Data**. The enclosing dark tray/background around the buttons is gone.
3. Dashboard starts with **Emergency operations dashboard** (current saved status summary), then **Device survival & departure checks** (on-demand battery/storage checks), followed by quick links to SOS draft, check-in and radio handoff. The separate readiness card follows.
4. SOS drafts and the full Family check-in form are in SOS & Check-ins. Radio check-in, inbox, handoff and team directory remain in Radio & Messages. Notes/References are under Plans & References. Encrypted backup is under Backup & Data.
5. These are the same existing DOM form elements, relocated client-side. No database migration, new transmissions or automatic location requests. Full forms stay behind their tabs, reachable in one click or keyboard navigation.

## Changed files

- `openrf/server.py`: allowlist two new JS paths (without broad wildcard access).
- `openrf/static/emergency-tabs.js`: Dashboard ordering, quick actions and device/backup grouping.
- `openrf/static/app.css`: remove outer tab tray while retaining spacing, active highlighting and touch targets.
- `openrf/static/index.html`: label the last tab **Backup & Data**; cache-bust scripts/CSS with v0.2.141.
- `openrf/__init__.py`, `openrf-bundle.json`: version bump.
- `tests/test_server.py`: **new real HTTP asset-availability regression** and unapproved-JS denial test.
- `tests/test_emergency_tabs_v140.js`: assert operations and survival order, standalone tab buttons and preserved forms.
- `README.md`, `CHANGELOG.md`, this release note.

## Test results

- `PYTHONPATH=tests:. python3 -m unittest discover -s tests -p 'test_*.py' -q`: **386 tests passed**.
- `for f in tests/*.js; do node "$f" || break; done`: **108 JS scripts passed**.
- Targeted HTTP test observed **GET /static/emergency-tabs.js?v=0.2.141 → 200**, **GET /static/breadcrumb_follow.js?v=0.2.141 → 200**, and **GET /static/not-permitted.js → 404**.
- The previous attempt to produce a Chromium screenshot in the development container was blocked by its sandbox/socket permissions. This patch has source/API/unit checks but still needs live Firefox visual and touch verification at 1280×800. No actual GPS trip or live Valhalla routing was tested in this patch.

## Install and manual checks

1. Save complete `OpenRF-v0.2.141.zip` in Windows Downloads. Run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

   The existing updater validates, backs up, installs and usually attempts a Git commit/push (optional `-NoPush`). A push is only an attempt to launch CI.
2. Stop the old WSL server with `Ctrl+C`, restart with `cd /mnt/c/projects/OpenRF && python3 -m openrf` and refresh Firefox using `Ctrl+Shift+R` so the v0.2.141 assets load.
3. On Emergency, click all five tabs. **Exactly one tab panel** should be shown; Dashboard should begin with **Emergency operations**, then **Device survival**. The separate tab buttons should have no surrounding tray card. Check keyboard Left/Right/Home/End switching and narrow-window horizontal tab scrolling.
4. Test an SOS **draft** and check-in without transmitting anything. Verify Radio handoff still requires explicit user confirmation. Ensure Plan/Reference and Backup sections retain their original records and forms.
5. On Map → GPS → saved Walking/Driving track, start **Follow reverse track (GPS)** only after intentional consent. If an approximate fix is returned, the live progress must pause until accuracy improves. Stop or hide the tab to release the watch. This mode remains a historical GPS reference, not safe turn-by-turn route guidance.

No personally recorded GPS data, private databases, maps or hardware state are bundled or deleted.
