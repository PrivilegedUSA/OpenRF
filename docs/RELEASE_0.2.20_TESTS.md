# OpenRF v0.2.20 — GPS-linked survey waypoint verification

## Scope

- Only an active investigation can accept user-triggered browser waypoint coordinates.
- A waypoint is labeled `BROWSER_REPORTED`, not a measurement, verified GNSS or transmitter location.
- A separate SQLite `survey_waypoints` table stores fresh fix age, reported accuracy (meters), client-reported time, server receipt UTC, note and session ID. Old observations and captures remain unchanged.
- Waypoint map visibility is OFF by default; the vector map and offline coordinate grid can display these points without route lines.
- Session GeoJSON includes precise coordinates **only after** explicit download confirmation; no upload or data transmission to external map servers is added by waypoint functionality.

## Automated tests

From WSL project directory:

```bash
python3 -m unittest discover -s tests
node --check openrf/static/app.js
node tests/test_frontend.js
node tests/test_history_analysis.js
node tests/test_signal_explorer.js
node tests/test_reports_frontend.js
```

`tests/test_survey_waypoints.py` checks freshness, rejected impossible values and forged sensor fields, session active status, additive migration, endpoint create/list/delete, and local GeoJSON export.

## Real browser operator check (not automated here)

1. Stop the old server with Ctrl+C. Download the full `OpenRF-v0.2.20.zip` into Windows Downloads and run the existing updater.
2. In Ubuntu run `cd /mnt/c/projects/OpenRF && python3 -m openrf`, then visit `http://localhost:8765` and use Ctrl+F5.
3. On Sessions start an investigation. Go to Map, expand **GPS-linked survey waypoints**, select that investigation and press **Save a fresh location waypoint**. Accept browser geolocation if appropriate.
4. Verify a saved point shows source `BROWSER_REPORTED`, fix age and accuracy (not a sensor frequency/RSSI). If desktop geolocation is blocked, the UI should show a permission or availability error, not invent a point.
5. Check **Show saved waypoints on map** to see a point, then uncheck to hide. Try online and offline/raster modes. Verify existing manual and RF observations are unaffected.
6. Use **Export session GeoJSON** only when comfortable saving precise survey coordinates; inspect the file's GeoJSON point and provenance. Test delete after confirmation.
7. Stop the investigation. A new point should be rejected until you start another active investigation.

## Limits

No automatic travel tracking, route estimation, navigation, network geolocation service, external GNSS hardware integration or live RF detection. Firefox and Raspberry Pi device tests were not run here; automated checks do not establish browser GPS accuracy. The browser may provide approximate desktop location. Coordinate export should be kept private.
