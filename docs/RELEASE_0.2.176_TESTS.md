# OpenRF v0.2.176 — Weather session exports and local Linux test runner

Complete OpenRF source bundle: `OpenRF-v0.2.176.zip` with only `openrf-bundle.json` at the ZIP root and installable source under `project/`. Its root manifest is `{"project":"OpenRF","formatVersion":1,"version":"0.2.176"}`. The local Windows updater, personal SQLite data, Git and credentials are not overwritten by the bundle.

## Changes

1. **Recording history CSV:** In Weather Station → History, each session displays an Export session CSV link. The new `/api/weather/recording/export.csv?session_id=N` GET returns the same source-tagged UTC/SI header columns as the existing station-wide export, restricted to that session's `recording_session_id` and station. It never combines one-shot, manual, imported or other session samples. It is capped at 5,000 rows, rejects unknown/duplicate/invalid query parameters, and returns a header-only CSV when no samples were saved. It does not read live sensors, start or restart a recorder, change station data, or upload anything.
2. **Local preflight:** `tools/test-openrf-linux.sh` runs Python compilation, the full Python test directory, Valhalla shell syntax, eleven app JavaScript syntax checks and all `tests/*.js` suites. `tools/Test-OpenRF.ps1` invokes it inside the same Windows machine's default WSL distro using the script-relative project path. Neither script stages, commits, pushes or triggers GitHub Actions. WSL must already have `python3` and `node`; to reproduce GitHub's two Python environments, each corresponding Python interpreter must be installed separately.
3. Prior Weather Hub Dashboard/Stations & Sensors/History organization, recording controls below metric cards, warnings, timestamp provenance, and existing navigation/messaging/hardware behavior remain in place.

## Reproduce tests

On the local Windows machine, in PowerShell from **any** directory (after installing this bundle):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\tools\Test-OpenRF.ps1'
```

In Ubuntu/WSL, with the app's server stopped (or using separate test database fixtures):

```bash
cd /mnt/c/projects/OpenRF && bash tools/test-openrf-linux.sh
```

Optional, if installed: pass `-PythonCommand python3.11` or `-PythonCommand python3.14` to the PowerShell launcher, or append `python3.11`/`python3.14` to the Bash launcher. These do not install interpreters. The default `python3` alone does not prove compatibility with both GitHub matrix versions.

`tests/test_weather_session_export_v176.py` checks session selection/isolation, empty/invalid sessions, CSV columns/source provenance, strict GET validation, and no sensor reads. `tests/test_weather_frontend_v168.js` checks the rendered per-session download link and absence of implicit downloads. `tests/test_local_preflight_v176.py` checks Bash syntax, WSL launcher command and local Node syntax coverage against the actual CI workflow.

**Automated test result:** The exact new `bash tools/test-openrf-linux.sh` preflight passed locally with **536 Python unit tests**, **140 JavaScript regression suites**, Python source compilation, eleven selected JavaScript syntax checks and the Valhalla shell syntax check. Tested with **Python 3.12.14** and **Node.js 24.22.3** in the development Linux container. The new session CSV boundary cases include an intentionally oversized 5,001-row synthetic fixture proving export is capped at 5,000. Real Windows PowerShell, Python 3.11/3.14 matrix and GitHub Actions for this new release have not run.

## Install and manual checks

1. Save `OpenRF-v0.2.176.zip` to Windows Downloads. Close OpenRF/Electron, then run the fixed, locally maintained updater from PowerShell:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

   If another `OpenRF-v*.zip` is newer in Downloads, use the updater's `-ZipPath` option to select `OpenRF-v0.2.176.zip` explicitly. The repaired updater verifies Git's staged content before it commits/pushes; it will stop if tracked local edits are present. Check GitHub Actions separately after push.
2. Start OpenRF from Ubuntu with `cd /mnt/c/projects/OpenRF && python3 -m openrf` and visit Weather Station → History. With no recordings, there is no export link. An existing session with saved samples has its own Export session CSV link. Verify that downloaded CSV contains only that session's ID and does not include manual or prior-session rows. A stopped/failed session with zero saved samples yields column headers only.
3. Run the PowerShell local test launcher. It must print an explicit pass or nonzero failure, and must not create a commit/push. Check Weather Dashboard opt-in recording and local warning controls still require explicit user actions. Use real hardware only when authorized and installed; no reading can be inferred from synthetic tests.

## Limits

- Tests are synthetic and do **not** verify physical Ecowitt, RTL-SDR, ESP32/USB weather sensors, measurement precision, WSL hardware forwarding, a Raspberry Pi 1280×800 touchscreen, or a real recording session in the field.
- Windows PowerShell/WSL launcher execution and the Windows updater cannot be executed on the local Linux-only development executor. Bash syntax, string/path checks and Linux test execution are verified instead. The updater itself is user-managed outside the ZIP.
- Successful local tests do not guarantee passing remote CI; only an observed GitHub Actions success establishes that result. The GitHub workflow still runs automatically on push unless separately changed.
