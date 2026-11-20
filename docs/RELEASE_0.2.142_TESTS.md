# OpenRF v0.2.142 — Emergency tab scroll fix

## What changed

The Emergency tab-row click handler no longer scrolls the page to itself when activating a tab. All five tab buttons remain functional and keep their existing roles, keyboard selection, visibility, and data bindings. Programmatic tab selection also switches in place. Dashboard quick-access shortcuts still scroll to a specific requested field.

Changed source files: `openrf/static/emergency-tabs.js`, `openrf/static/index.html`, `openrf/__init__.py`, `README.md`, `CHANGELOG.md`, `docs/RELEASE_0.2.142_TESTS.md`, plus version-related existing regression tests and the ZIP-root `openrf-bundle.json`.

## Automated testing

- `PYTHONPATH=tests:. python3 -m unittest discover -s tests -p 'test_*.py' -q`
- `for file in tests/*.js; do node "$file" || exit 1; done`
- `node tests/test_emergency_tabs_v140.js` specifically checks that SOS click, keyboard ArrowRight, programmatic Backup & Data, and Dashboard return do not invoke scrolling, while retaining correct tab selection and panel visibility.
- Results: **386 Python tests passed; 108 JavaScript test scripts passed** on the WSL-compatible development runtime.
- Complete release archive integrity and ZIP-root manifest version are checked before distribution.

## On-device verification

1. Download the complete `OpenRF-v0.2.142.zip` to Windows Downloads, then run:

   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`

2. Restart the Python server from WSL if it is already running (`cd /mnt/c/projects/OpenRF && python3 -m openrf`). In the browser, use Ctrl+Shift+R once to bypass cached scripts.
3. Open Emergency, scroll down slightly, then tap **Dashboard**, **Backup & Data**, **SOS & Check-ins**, and the other tabs. Their contents should change without the viewport being pulled to the tabs.
4. Confirm keyboard Left/Right tab selection, persistent immediate-danger warning, preserved forms and values, and that the Dashboard shortcuts still open the correct tool.

No physical Raspberry Pi, GPS, SDR, emergency message transport, offline route coverage, or browser touchscreen field test was performed by these unit tests. On a very short tab, browsers may still limit a scroll position beyond the document's remaining height; this patch specifically removes OpenRF's forced scrolling.
