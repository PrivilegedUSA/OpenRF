# OpenRF v0.2.57 — Validation and field troubleshooting

## Changes

- Camera map popup created using `new maplibregl.Popup({className:'openrf-camera-map-popup'})`; dark navy background, white/teal text, high-contrast source link, styled close button and arrow. Other popups unchanged.
- `tools/setup-valhalla-wsl.sh --doctor` read-only local Docker status and localhost:8002 health probe, then a Sacramento-to-Auburn route test if service responds. No network download, no private GPS data.

## Test steps on Windows/WSL

1. Stop OpenRF, install release with updater, launch app. Refresh browser cache.
2. Open Map, select an imported ALPR marker. Confirm dark readable popup, scroll at 800×480, and that source link is visible. Check Map → Layers toggles/other controls unchanged.
3. In **Windows PowerShell**, run:
   `wsl -d Ubuntu -- bash -lc "cd /mnt/c/projects/OpenRF && bash tools/setup-valhalla-wsl.sh --doctor"`
4. If no container/graph, verify Docker Desktop with WSL Ubuntu integration. With consent to download/build an area, start smaller NorCal profile:
   `wsl -d Ubuntu -- bash -lc "cd /mnt/c/projects/OpenRF && bash tools/setup-valhalla-wsl.sh --install --region norcal"`
   This downloads road source data and may require significant time/RAM/disk; not part of the release ZIP. Do not begin nationwide graph build just because free disk is available.
5. Follow build progress by running `--logs`; rerun `--doctor` after service is ready, then attempt Auburn directions again. The reference test only checks one route, not all road coverage.

## Test limits

Python unit tests and JS source checks use stubs, not real Docker, Geofabrik, Valhalla graph, GPS or live camera data. No Raspberry Pi or actual user browser hardware test. Camera source details and existing OpenRF user data remain private.
