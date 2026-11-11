# OpenRF v0.2.13 — Smooth location camera test notes

## Changed files

- `openrf/static/app.js`: animated MapLibre GPS flight, pending-location handling, user-gesture precedence, cancellable raster camera transition and reduced-motion support.
- `openrf/static/index.html`: version label and clearer optional offline-tiles heading.
- `openrf/__init__.py` and `tests/test_server.py`: 0.2.13 version.
- `tests/test_frontend.js`: actual camera behavior tests with MapLibre spy and raster animation frame scheduler, reduced-motion, and stale-request behavior.
- `README.md`, `CHANGELOG.md`, `docs/RELEASE_0.2.13_TESTS.md`: release documentation.

## Automated tests (WSL)

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -v
node --check openrf/static/app.js
node tests/test_frontend.js
```

## Manual smoke tests (Windows Firefox + Ubuntu/WSL)

1. In Windows PowerShell, run the existing updater with `OpenRF-v0.2.13.zip` placed in Downloads: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`.
2. Stop any running OpenRF (Ctrl+C) and restart Ubuntu with `cd /mnt/c/projects/OpenRF && python3 -m openrf`. Open `http://localhost:8765` in Firefox and press Ctrl+F5 to bypass cached frontend JavaScript.
3. Open Survey Map. When location is permitted and the browser returns a fix, verify that the camera visibly travels from the U.S. overview to the reported position instead of snapping. Exact position and accuracy depend on the browser/OS and cannot be independently verified by OpenRF.
4. Deny location permission and confirm the overview remains usable. After enabling location, try the **My browser location** button. The flight should animate unless the OS/browser requests reduced motion.
5. While Firefox is still waiting for a browser location, drag the map. An automatic fix should not unexpectedly override the user-selected view. Explicit My browser location should recenter if pressed afterward.
6. Use **Offline / raster** (without a map package). Press My browser location and check that the coordinate grid pans and zooms gradually, and that wheel/drag/+/- interaction interrupts its motion. If a licensed local raster MBTiles map is installed, confirm no public raster tile URLs are requested.
7. Confirm the existing offline file manager, saved map areas, observations, investigations, USB diagnostics and scanner screens still load normally. Offline map area management remains optional and collapsed.

## Limitations

Automated tests use mocks and static scripts; there was no real Windows Firefox click-through, browser permission dialog, physical GPS, Pi hardware, sensor receiver, USB scan or radar detection tested here. Animation is visual only: it does not improve GPS accuracy or imply a transmitter location. Offline vector streets are still internet-dependent unless a separate permitted raster MBTiles map is installed. No external data was uploaded or downloaded.
