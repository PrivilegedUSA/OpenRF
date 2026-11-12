# OpenRF v0.2.27 — U.S. address search, route setup and verification

## Changed files

- `openrf/geocoding.py`: enforce U.S. country filters and house-number-first labels, screen explicitly foreign suggestions.
- `openrf/static/index.html`, `openrf/static/app.css`, `openrf/static/app.js`: full-width Start navigation, explicit choice of geocoded address, Valhalla readiness check.
- `openrf/routing.py`, `openrf/server.py`: loopback-only status endpoint; local route API unchanged.
- `tools/setup-valhalla-wsl.sh`, `docs/LOCAL_VALHALLA_WSL.md`: optional Docker / Northern California road-graph setup guide.
- `tests/test_routing_geocoding.py`, `tests/test_navigation_frontend.js`: new regression checks.
- Version, README and changelog.

## Test commands

```bash
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests
node tests/test_frontend.js
node tests/test_navigation_frontend.js
node --check openrf/static/app.js
bash -n tools/setup-valhalla-wsl.sh
```

## Manual Firefox checks

1. Stop OpenRF with Ctrl+C. Download `OpenRF-v0.2.27.zip` to Downloads and install using `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`.
2. Restart `cd /mnt/c/projects/OpenRF && python3 -m openrf` in Ubuntu; open `http://localhost:8765` and Ctrl+F5.
3. Confirm U.S. address lookup is unchecked by default, then opt in and type an address in California. Suggestions should be U.S. only with house numbers where known. Select a candidate. Public Photon may be blocked or lack the specific street.
4. Confirm Start navigation is full-width below consent, not squeezed alongside it.
5. Without Valhalla, a route must be a dashed direct line, never a drivable line. Expand Plan a trip and press Check local routing service.
6. For optional real route data, follow `docs/LOCAL_VALHALLA_WSL.md` (large explicit download, Docker required), then test two points covered by the installed road graph. Solid road geometry and turn list only when Valhalla genuinely responds.

## Limits

No actual Valhalla tiles or public Photon/MapTiler connections were available for integration testing here. An online Photon demo may throttle or reject lookups. The app cannot guarantee every U.S. address is mapped, and it does not provide active spoken guidance, route avoidance, police location inference or live road closures. The Docker setup requires user action. No hardware testing or private investigation data included in the bundle.
