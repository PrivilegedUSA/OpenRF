# v0.2.202 — corrective stabilization

No new radio transmissions. Upgrade from v0.2.201 or earlier while OpenRF is stopped. Before starting the new release, make a private offline copy of the data directory (`~/.local/share/openrf` by default; if `--db` is set, use that database's parent). Do not put it in Git. The first startup migrates `mesh_history_samples` and its settings from the main DB into `<main-db-filename>.mesh-nodes.sqlite3`, verifies the copy before dropping the legacy tables, and compacts the main DB. A failed copy leaves the old records intact. If compaction is blocked, restart with sufficient disk space and no other database processes. Do not downgrade after migration without restoring your pre-upgrade data backup; older versions will not see the separate history.

- Snapshot recording consent remains; background consent is off after migration. Enable both checkboxes in Local node history to collect in the background.
- Emergency encrypted backups still cover the main DB only, with their original 16 MiB limit. Separate mesh history is not included. To back it up explicitly, stop OpenRF and copy the dedicated SQLite file (and any existing SQLite sidecars) to private encrypted storage. To recover it, stop OpenRF and restore that file set to its original path. Not an in-app encrypted mesh-history backup; never copy an active database file alone.
- History remains limited to 100,000 rows and targets a 64 MiB live-page limit; oldest rows may be pruned earlier. The file can temporarily exceed this during inserts/compaction. Disk space is still required for SQLite transactions and VACUUM. Existing migrated rows are not truncated during migration.
- Reticulum request IDs match replies. If a command times out its outcome is unknown; later commands wait for the late reply to drain or the user to stop/re-enable Reticulum. Never retry a send blindly.
- Validate telemetry and capture changed next-hop/interface evidence. Invalid historic telemetry is omitted in API responses. Record collection success and partial/failure separately; shutdown waits for the collector before closing radio managers.

Tests: `python3 -m unittest discover -s tests -v`; `for f in tests/*.js; do node "$f" || exit; done`. `test_stabilization_v202.py` reproduces a 100,000-row legacy DB that exceeded the backup cap, migration preservation/reopen, recording consent, invalid telemetry, changed path associations, collector failure, and a late IPC response. The unread test mock now implements the document listener rather than skipping the assertion. No live radios or Windows updater needed for these automated tests.

Manual: preserve local backup; launch; verify dashboard and Emergency backup; enable snapshot then background separately; stop and start; check retained history and application shutdown. No live RF, Pi, Windows or GitHub CI validation claimed.

## Verified release results

- Python 3.13.5: Ran 607 tests in 78.075s; OK.
- JavaScript: 163 scripts, 0 failures.
- Python compilation passed.
- No original bundle files removed.

### Changed files relative to previous release

- `openrf-bundle.json`
- `project/BUNDLE_FORMAT.md`
- `project/CHANGELOG.md`
- `project/openrf/__init__.py`
- `project/openrf/mesh_dashboard.py`
- `project/openrf/mesh_history.py`
- `project/openrf/mesh_monitor.py`
- `project/openrf/reticulum_lan.py`
- `project/openrf/server.py`
- `project/openrf/static/index.html`
- `project/openrf/static/mesh-dashboard.js`
- `project/openrf/static/weather.js`
- `project/tests/test_mesh_monitor_v201.py`
- `project/tests/test_unread_active_inbox_v093.js`
- `project/tools/openrf-electron/backend.js`
- `project/tools/openrf-electron/package-lock.json`
- `project/tools/openrf-electron/package.json`
- `project/docs/RELEASE_0.2.202_TESTS.md`
- `project/tests/test_stabilization_v202.py`
