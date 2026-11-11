# OpenRF v0.2.23 — Navigation foundation and map UI test guide

## Features delivered

- Sidebar/hamburger **Navigation** page with explicit start/destination coordinates, fresh browser location button, destination pick-on-map action and map preview.
- The map preview is a **straight-line geometric reference**, never a road route. It displays great-circle miles/km, initial bearing and a dashed overlay, not travel time or directions.
- Save, reuse and delete up to 250 named destinations in private SQLite (an additive table). These are not RF observations and they never create waypoints.
- The map's lower-right + and stacked-layers controls are borderless 32px; the duplicate button below the map is removed.
- Required OpenStreetMap/OpenMapTiles/OpenFreeMap credits remain available in the subtle ⓘ disclosure. Do not hide/delete attribution.
- Observation **Use my location** is directly after longitude and retains fresh-fix, manual-edit, and source accuracy safeguards.

## Local tests

```bash
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests
node tests/test_frontend.js
node tests/test_navigation_frontend.js
```

CI additionally checks the syntax of `openrf/static/navigation.js` and tests historical analysis, reports, and hardware readiness.

## Manual Firefox checks

1. Stop the currently running server. Use the normal updater with `OpenRF-v0.2.23.zip` in Downloads:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```
2. Restart Ubuntu OpenRF:
   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```
3. Open `http://localhost:8765` and use Ctrl+F5. Check Map's compact + and Layers buttons, unchanged map-click observation flow, and ⓘ attribution links.
4. Map → +: confirm **Use my location** is right below longitude. It must not save anything until **Save locally**.
5. Navigation: enter a start and destination, then **Preview on map**. Expect a dashed direct line and a prominent **NOT A ROAD ROUTE** label. There should be no turn directions or route ETA.
6. Navigation: choose **Pick on map** and tap a point. It should populate the destination, not create a survey observation. Start/source coordinates must remain manually controlled.
7. Save a destination, reload the page, use it again, and delete it. Confirm observations/sessions/waypoints are unaffected.
8. Deny geolocation: navigation start remains editable manually. Ensure there are no automatic location recordings or third-party routing requests.
9. Test online MapLibre as well as offline coordinate fallback (if available). Browser-specific visual animation/overlay presentation should be checked on the user's own Firefox/Raspberry Pi screen.

## Limitations

No offline road graph, geocoder, turn-by-turn navigation, traffic, camera avoidance, reliable police location detection, audible driving alerts, persistent route, or hardware radar detection in this patch. No live RF or physical GPS device testing has been conducted. The preview is an illustrative geographic bearing/distance only and is not safe driving guidance. All routes are explicitly unimplemented.
