# OpenRF v0.2.41 — GPS-linked saved signal comparison

## Changes from v0.2.40

- Adds a **read-only multi-location survey inspector** to the existing Survey Map Layers panel. This uses previously saved observations, never a live radio feed.
- The inspector groups measurements strictly by recorded signal identifier, source, source device, hardware identity, frequency and measurement **unit**. It accepts Wi-Fi, BLE, RF and cellular observations only when they contain a numeric compatible measurement and an observer location.
- For an eligible series recorded at two or more differing reported coordinates, selecting **Compare saved readings** highlights up to 80 recent stored measurement locations (no connecting lines, no claimed travel track), and opens a chronological, unit-labeled chart and last 30 saved position details. Both MapLibre and raster/coordinate fallback highlight the saved positions.
- The panel shows reported latitude, longitude, UTC-derived local display time, location provenance, session ID, receiver/source warnings, and recorded location accuracy when present. Its accuracy-circle comparison is descriptive, **not a proof of position or localization**.
- Export CSV includes precise receiver locations **only after explicit confirmation**; existing strict history CSV handling includes timestamp/source metadata. No upload or background collection.
- Adds a concise map-layer guide to manually collecting observations from multiple receiver positions. No database migration, new runtime dependency, or changed route/navigation behavior.

## Test steps on Windows 11 + Ubuntu WSL

1. Download the complete ZIP and install using the existing, reserved updater from PowerShell:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

2. Restart the already installed backend from Ubuntu:

   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```

3. Visit `http://127.0.0.1:8765/` in Firefox, hard refresh, then open **Survey map → Layers → Record a multi-location wireless survey**.
4. For genuine new readings, use Linux-visible Wi-Fi or BlueZ BLE hardware. At one receiver position, perform an explicit one-shot scan and manually save the device/scan with a fresh *observer* location. Move to a different position and repeat for the same signal, frequency, source and receiving hardware. A missing Linux radio in WSL is an **unavailable state**, not a successful empty scan.
5. With at least two compatible mapped readings, tap a saved marker or use Layers → Saved wireless readings → Inspect. Under its signal history choose **Compare saved readings at N coordinates**. Verify highlighted receiver sample points on the map, historical unit-labeled plot and exact reported accuracy/time/source fields; use **Show sample area**.
6. Change the date window or layer filter to remove some samples and verify the highlights are limited to currently visible saved data. Clear the selection to remove highlights.
7. Verify one sample alone, different sources, different adapters, frequencies, units or missing locations do **not** create a multi-location series. Turn on DEMO explicitly before viewing any synthetic records; labels must always say DEMO/HISTORICAL.
8. Test **Export sample CSV**: cancel and verify no download; confirm and inspect private coordinates in the downloaded local CSV. Handle this file as sensitive location data.
9. Switch to offline vector or raster map to check marker visibility and review the existing Valhalla navigation, sensor readiness and observation dialogs.

## Automated checks

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for f in tests/*.js; do node "$f"; done
```

New tests include `tests/test_v041_spatial.js` (strict identity, GPS provenance, different-site signal series, independent RSSI/quality, limits, no fake paths) and `tests/test_v041_spatial_http.py` (read-only endpoints and database unchanged).

## Limitations

- Does **not** continuously scan, track a transmitter, calculate an estimated source, render signal heatmaps, or infer signal distance/direction from RSSI or quality.
- Some Wi-Fi readings may be cached; a timestamp can represent retrieval rather than a fresh radio measurement. Bluetooth addresses can rotate.
- Different recorded GPS coordinates can overlap in actual location within their accuracy; the summary does not establish independent physical sites.
- Browser GPS on Windows/WSL and Raspberry Pi GNSS still need actual hardware testing; physical Wi-Fi/BLE scanning and visual Firefox field testing not performed in the build environment.
- No new GitHub CI result verified. Older source, offline attribution, license notices, archived Android, and private data separation remain intact.
