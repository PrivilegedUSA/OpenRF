# OpenRF v0.2.29 — Local autocomplete provider configuration

## Files changed

`openrf/geocoding.py`, `openrf/server.py`, `openrf/static/index.html`, `openrf/static/app.css`, `openrf/static/app.js`, `openrf/__init__.py`, `README.md`, `CHANGELOG.md`, `docs/RELEASE_0.2.29_TESTS.md`, `tests/test_geocoder_configuration.py`, `tests/test_routing_geocoding.py`, `tests/test_navigation_frontend.js`, `tests/test_readiness_frontend.js`, `tests/test_server.py`.

## Update

Run in **Windows PowerShell** after placing the ZIP in Downloads:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

Stop the old Python server with Ctrl+C. From Ubuntu:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

Open `http://127.0.0.1:8765/` in Firefox and hard-refresh (Ctrl+F5). No existing local database migration is required.

## Important limits

MapTiler requires a **separately acquired valid key**, its applicable terms and internet connectivity. This release adds the configuration workflow but does not supply credentials, a commercial account or live service availability. The public Photon demo is not a dependable autocomplete provider. The U.S. Census fallback geocodes completed addresses only. No live MapTiler, Photon, Census, Raspberry Pi or Windows Firefox verification is claimed from source regression tests.

Local Valhalla is independently installed: run `bash tools/setup-valhalla-wsl.sh --status` in Ubuntu, or choose a point directly on the map to test local road geometry. A functioning routing service requires road tiles; geocoding alone is not road navigation. Planned turns do not provide live GPS-following, spoken directions or rerouting.

## Verification checklist

1. Confirm Start navigation remains full width and the address-search explanation is on the line below the checkbox label.
2. With the checkbox **off**, typing an address must not generate external geocoder requests. Saved destinations and map picking remain available.
3. Expand Address search setup, save a valid MapTiler key locally. Confirm no key value is shown on the page or status endpoint and the key file has mode 600 outside the source tree.
4. Opt into online search and use **Test suggestions**. A successful test only establishes that a sample lookup responds; it does not establish address coverage.
5. Type a real U.S. street address. Confirm autocomplete suggestions can be explicitly selected; verify the chosen map pin before planning a route.
6. Enter an invalid key: expect an explicit failure, not fabricated candidates. Removing a key returns to public Photon best effort.
7. Check local Valhalla status and choose a map point to test real route geometry independently of Photon/MapTiler.
8. Verify prior surveys, investigations, offline maps, RF hardware states, exports and the archived Android source are preserved.

Tests: `python3 -m unittest discover -s tests -q`, `node --check openrf/static/app.js`, all seven JS suites in `.github/workflows/openrf-linux.yml`, `bash -n tools/setup-valhalla-wsl.sh`.
