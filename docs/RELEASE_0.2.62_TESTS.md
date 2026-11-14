# OpenRF v0.2.62 — test and release checklist

## New behavior

1. Open **Map → Route preferences**; highway, toll, and all three camera-category switches are grouped together. They are initially off. The rare **Avoid a particular road or gate** editor and **Address search and provider settings** are collapsed by default.
2. With a verified local Valhalla road route, expand **Directions**, tap **Avoid this road** on a suitable maneuver, and select **This trip** or **Save for future trips**. Press **Recalculate directions** and check whether Valhalla returns a different road route. If it cannot, use the original safe road route rather than promising a successful avoidance.
3. Reopen Route Preferences to remove a temporary or saved excluded point. Confirm saved points and camera/highway/toll choices persist only in the same browser's local storage. Verify they are not committed to Git.
4. Route exclusions are **points on a road after the turn**, not street-wide bans; some maneuvers lack safe geometry and do not offer avoidance. Real-world gates and access signs take precedence.
5. While navigation is active, do not allow road preferences to silently replace the current road route. Stop safely to change routes.

## Automated checks

- `python3 -m unittest discover -s tests -p 'test_*.py' -q`
- `for f in tests/test_*.js; do node "$f" || exit 1; done`
- `node --check openrf/static/app.js` and `node --check openrf/static/route_guidance.js`
- Isolated Chromium CSS screenshots at 800×480, 390×844, 480×320, and desktop size; no horizontal overflow.
- Compare every v0.2.61 managed path against this release; verify identical offline map archives, no private/local state, credentials, or real RF/GPS records.

## Limitations

The automated tests use controlled route data. They do **not** prove that a selected road exclusion is honored by the user's live Northern California Valhalla graph, or that a safe alternate exists. No live external traffic, moving GPS, physical RF receiver, Raspberry Pi touchscreen, or GitHub CI execution was verified here.
