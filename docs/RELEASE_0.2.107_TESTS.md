# OpenRF v0.2.107 — verification and unresolved regional map diagnosis

## Changes

- `openrf/static/index.html`, `openrf/static/app.css`: exact OpenRF sidebar logo and release identifier; new browser icon and manifest references. No new permanent overlay over the 5-inch map.
- `openrf/static/assets/*`: six original OpenRF brand-kit PNGs; `openrf/static/manifest.webmanifest`: local app display metadata.
- `openrf/server.py`: explicit allowlist for image responses and favicon PNG compatibility route.
- `openrf/static/camera-layers.js`: checks geographic latitude/longitude limits before fetching camera catalog bounds.
- `openrf/__init__.py`, release manifest, tests and changelog: version and verification information.

## WSL smoke test

1. In Windows PowerShell, apply the full `OpenRF-v0.2.107.zip` using `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'` after placing the ZIP in Downloads. The updater makes a backup and may commit/push to GitHub; `-NoPush` remains available.
2. Stop the previous Linux service with Ctrl+C; restart with `cd /mnt/c/projects/OpenRF && python3 -m openrf` and open `http://localhost:8765`.
3. Open the sidebar: verify the correct colored wordmark, not the placeholder circle, fits at 800×480 landscape. Check the browser tab icon. `http://localhost:8765/favicon.ico` and `http://localhost:8765/static/assets/openrf-wordmark-light.png` should return an image, not a 404.
4. At the full-USA view, Firefox's Network tab should not show repeated malformed `/api/cameras?bounds=...` HTTP 400 errors. Zoom into the local area to load the catalog normally.
5. The blank **regional map** remains unverified in this patch. Open `http://localhost:8765/api/vector/status` and record the exact JSON. In Firefox's Network filter, look at requests containing `/api/vector/tiles/` and `/api/vector/fonts/` after it zooms into Amador/Calaveras. Check their HTTP status plus the first red error in Firefox's Console. A style JSON HTTP 200 does not establish successful local tile drawing. Keep the console open for the next targeted patch.

## Automated tests

Run from the `project/` folder:

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.js
```

Tests cover the local HTTP branding routes, same-origin restrictions, manifest/icon references and world-wrapped-bounds guard. No WebGL GPU, real installed regional map archive, Raspberry Pi touchscreen, Wi-Fi HaLow or RF hardware was exercised here.
