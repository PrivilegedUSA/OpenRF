# v0.2.203 — resource and privacy stabilization

In addition to the v0.2.202 migration and IPC fixes:

- Dashboard and background collector share a nonblocking single-flight inventory reader. An occupied protocol is labeled busy rather than waited on. Reticulum dashboard IPC has a two-second response deadline; ordinary commands keep their existing deadline. A timed-out command is not automatically retried. Explicit Stop still attempts to shut down the owned worker, even after failed history sync.
- A failed local history migration/open does not prevent other workspaces from starting; the dashboard reports history unavailable. Check local disk space, permissions and logs, stop OpenRF, preserve the existing DB files and restart. No automatic deletion on failed migration.
- History usage is shown (sample count, file size and live-page target). Clearing history atomically turns recording off. Retention and byte targets still apply; temporary SQLite work files may require extra free space.
- Close SQLite handles deterministically in messaging, emergency records, breadcrumbs, surveillance recordings, device checks and staged map downloads. Main and node DB files request POSIX mode 0600 and reject symlink/nonregular file targets. Linux filesystem permissions are not encryption; Windows-mounted WSL filesystems can have different permission semantics. Keep data in the Linux home directory or protect it with OS-level encryption.
- Reject cross-site browser requests to local APIs including GET, validate exact JSON media type, and log API categories instead of private query/path details. The loopback application is still unauthenticated; other local programs/users with access can reach it. This is not a penetration test or a comprehensive security certification. Old logs are not changed.

Tests: `python3 -m unittest discover -s tests -v`; `for f in tests/*.js; do node "$f" || exit; done`. `test_stabilization_v203.py` verifies concurrency exclusion, busy-manager skipping, permissions, clear consent, deterministic resource closure, cross-site rejection, redacted request logs and fail-soft HTTP behavior. Existing tests cover the surrounding workspaces. Hardware throughput, Windows updater, Pi memory use and GitHub Actions still require real validation.

## Verified release results

- Python 3.13.5: Ran 611 tests in 79.508s; OK.
- JavaScript: 163 scripts, 0 failures.
- Python compilation passed.
- No original bundle files removed.

### Changed files relative to previous release

- `openrf-bundle.json`
- `project/BUNDLE_FORMAT.md`
- `project/CHANGELOG.md`
- `project/openrf/__init__.py`
- `project/openrf/breadcrumbs.py`
- `project/openrf/device_survival.py`
- `project/openrf/emergency.py`
- `project/openrf/mesh.py`
- `project/openrf/mesh_dashboard.py`
- `project/openrf/mesh_history.py`
- `project/openrf/mesh_monitor.py`
- `project/openrf/reticulum_lan.py`
- `project/openrf/server.py`
- `project/openrf/static/index.html`
- `project/openrf/static/mesh-dashboard.js`
- `project/openrf/static/weather.js`
- `project/openrf/storage.py`
- `project/openrf/surveillance_recording.py`
- `project/openrf/topographic_download.py`
- `project/openrf/trip_maps.py`
- `project/tools/openrf-electron/backend.js`
- `project/tools/openrf-electron/package-lock.json`
- `project/tools/openrf-electron/package.json`
- `project/docs/RELEASE_0.2.203_TESTS.md`
- `project/tests/test_stabilization_v203.py`
