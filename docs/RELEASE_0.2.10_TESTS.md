# OpenRF v0.2.10 — release verification

## Changed/added managed files relative to v0.2.9

- `openrf/offline_maps.py`: bounded local raster MBTiles import, validation, atomic no-overwrite publish, explicit removal.
- `openrf/server.py`: local file upload/delete API, origin and host controls, map operation lock, zero-store tile response.
- `openrf/static/index.html`, `openrf/static/app.css`, `openrf/static/app.js`: responsive map-area manager, file picker, bounds summary, view-area control, confirmation-based removal, local-only status.
- `tests/test_map_manager.py` (new), `tests/test_offline_maps.py`, `tests/test_server.py`, `tests/test_frontend.js`: new import/malformed/symlink/duplicate/HTTP/data-preservation and JS contracts.
- `openrf/hardware.py`, `openrf/sensor_connections.py`: future long-range police radar capability shown as **NOT IMPLEMENTED**.
- `docs/RADAR_RECEIVER_ROADMAP.md` (new), `docs/HARDWARE_SHOPPING_LIST.md`: receive-only X/K/Ka and optical LIDAR future architecture; no hardware detection yet.
- `docs/OFFLINE_MAPS.md`, `docs/ARCHITECTURE.md`, `README.md`, `CHANGELOG.md`, `openrf/__init__.py`: version, user instructions, caveats.

## Tests

From installed `C:\projects\OpenRF` in Ubuntu WSL, or in isolated extracted `project/`:

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -v
node --check openrf/static/app.js
node tests/test_frontend.js
```

For manual browser testing: run `python3 -m openrf`, open `http://localhost:8765`, expand **Manage offline map areas**, and import a legally obtained raster MBTiles archive. Confirm the catalog/metadata, **View area on map** (when bounds are declared), and explicit removal while preserving survey observations. Temporarily disconnect internet to confirm local tile display. Do not use fake/historical RF data to establish live hardware support.

## Limits

- Synthetic SQLite/PNG test fixtures validate API paths, but do not verify a real licensed geographic raster MBTiles package, WebP/JPEG rendering in Firefox, large-map performance, or Raspberry Pi storage.
- Chromium browser smoke test could not execute in this hosted environment because it was blocked from accessing local HTTP (`ERR_BLOCKED_BY_ADMINISTRATOR`). Browser interaction must be checked on the user's Firefox/WSL setup.
- No actual ESP32/USB, native Wi-Fi, SDR, microwave radar, laser, GNSS or Raspberry Pi measurements were collected. No map provider download rights or tile-area downloader has been implemented.
- No SQLite observation database migration is required. Private maps and investigation data must remain outside the updater-managed source tree.
