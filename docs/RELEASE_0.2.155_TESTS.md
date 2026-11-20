# OpenRF 0.2.155 — native shell backgrounding and resource readings

## Automated coverage

- Full Python unittest suite: **427 passed** (`python3 -m unittest discover -s tests -p 'test_*.py' -q`, Python 3.12.14 on Linux).
- Full Node.js browser/frontend suite: **125 test files passed**, including the new native shell runtime test (`node` v24.22.3).
- New `tests/test_electron_runtime_v155.js`: checks the internal read-only resource model, no sensitive process fields, active/hidden view contract, single-instance lock and Electron-only App Settings presentation.
- Release ZIP root must contain `openrf-bundle.json` identifying exactly `OpenRF` format `1`, version `0.2.155`, with installable files only under `project/`. ZIP integrity and manifest check are done at release packaging.

## Manual WSL/Linux validation

1. Install the source ZIP with `Update-OpenRF.ps1` (outside the archive). Stop any old OpenRF server using Ctrl+C.
2. Open Ubuntu/WSL, then `cd /mnt/c/projects/OpenRF/tools/openrf-electron` and `OPENRF_URL=http://127.0.0.1:8765/ npm start` with Linux Electron dependencies already present.
3. Open Web Browser → Go to a public URL → navigate inside it → add a second tab → switch back; the first website should still be loaded and preserve its navigation.
4. Leave the browser for the map; embedded pages should disappear without covering the map. Return to Browser; the selected tab should still be loaded. Closing a tab should end its Chromium page.
5. Open App Settings → Desktop shell resources. Refresh idle, after loading two sites, and after closing tabs. Record process count, approximate working set, CPU sample and OS available RAM. The card should not appear in Firefox at `http://127.0.0.1:8765/`.
6. Launch `npm start` a second time while the first OpenRF shell is open. The first window should focus and no duplicate window should remain. This needs visual confirmation; do not confuse it with an older server-version conflict.

## Limits

- Electron/WSLg graphical behavior, external site compatibility, Pi ARM64, battery use, process CPU/load and real RAM figures cannot be proven by static tests. The working-set sum may include shared Chromium memory more than once and never includes the Python backend process.
- No Raspberry Pi, hardware GPS, RF receiver, actual offline street coverage or `.deb` install was tested by these changes. No third-party websites were opened automatically.
