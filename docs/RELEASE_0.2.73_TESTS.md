# OpenRF v0.2.73 — Camera approach alerts

## Scope

- Frontend-only approach decision helper with geographic route projection, site type/distance filters and route-ahead check.
- Camera approach preferences in Navigation & route preferences: visual master switch, ALPR, SPEED and RED_LIGHT switches, 0.25/0.5/1-mile distance, voice opt-in. Only these settings are persisted in browser localStorage.
- Active GPS-follow HUD displays a small amber reported-camera banner with evidence/source qualifications; optional independent speech warns once per site, with cooldowns and maneuver speech priority.
- Cached local route-camera report limit raised from 24 to 256; `incomplete` marks overflow or catalog truncation. No live camera detection, traffic feed or internet service required once maps and catalog are installed.

## Automated checks

From the `project` folder:

```bash
python3 -m unittest discover -s tests -q
for test_file in tests/*.js; do node "$test_file" || exit 1; done
node --check openrf/static/camera_alerts.js
node --check openrf/static/app.js
python3 -m compileall -q openrf
```

The pure JavaScript test checks category/distance selection, de-duplication, forward projection, and rejection of approximate, stale, stationary, wrong-direction and off-route fixes. Python coverage checks that more than 24 real saved camera sites are reported along a route without falsely setting the incomplete flag.

## Field test when GPS hardware is available

1. Confirm a real Valhalla road route and locally imported camera reports. Open Navigation & route preferences, expand Camera approach alerts, select categories and notice distance. Leave voice off for the first test.
2. Start real GPS navigation, confirm the accuracy/source status and follow normal road signs. A map-reported camera *ahead* near the selected road should appear in the amber banner only on fresh accurate moving GPS fixes. A reported camera off the road should not trigger.
3. Safely stop and alter the category switches or range. The visual alert selection should follow saved settings on the next fix, even after a browser refresh.
4. Enable spoken camera alerts only if permitted and safe. Verify that alert speech does not interrupt a nearby turn prompt and cannot repeatedly announce one camera. Browser speech synthesis is best effort.
5. Test without GPS, with imprecise browser network location, when off-route, with no mapped records, and during the separately labeled DEMO route. These states should never produce a LIVE camera approach warning.

## Known limits

Reports are mapped infrastructure points, not evidence of operational status, travel-direction coverage or live enforcement. A reported position can be inaccurate; traffic direction and nearby parallel roads can still be ambiguous. Camera data may be incomplete or outdated. No user GPS history or camera detection events are saved. The route may contain more than 256 reported camera sites, in which case the alert catalog is explicitly incomplete. On-road reliability and Raspberry Pi/Firefox audio require real user verification. Do not interact with settings while driving.
