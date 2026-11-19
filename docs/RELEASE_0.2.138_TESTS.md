# OpenRF v0.2.138 — destination layout, radio polish, walking recovery

## Install in WSL / Windows

1. Download `OpenRF-v0.2.138.zip` to Windows Downloads, then run the existing updater from PowerShell:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

2. Review the updater's actual output, restart the Linux app if required, and hard-refresh Firefox. Confirm **FIELD CONSOLE · 0.2.138**. The ZIP is a complete managed `project/` bundle and never includes or replaces `Update-OpenRF.ps1`, `.git`, private records or `local-data`.

## Manual UI checks

1. On Map → **Where to?**, choose **Walk** and tap a destination on the map. The **Destination selected** popup should have one full-width **Walking directions** button; underneath, **Change start** and **Change destination** should be horizontally paired. There should be a modest gap between the message and the buttons. Tap Change destination: it must still re-enter map pin placement; Change start must still reopen the existing starting-point editor.
2. Repeat with Drive. **Driving directions** should also use the full first row; driving route preferences still appear in their usual place and any valid Start navigation behavior remains guarded by an actual driving route. Check ~800×480 landscape and a larger desktop viewport for clipping and unnecessary scrolling.
3. Navigate to Radio Receiver: **Tune a frequency** should sit about 18px above **Linux receiver setup**, with a visible gap instead of touching borders. The setup card's link opens **Signal Viewer**. The sidebar now says Signal Viewer; its page remains headed **Spectrum & waterfall**, and its captures continue to be explicit and receive-only.
4. The Emergency sidebar icon should match the triangle/exclamation in the header. Clicking either still opens Emergency; neither button transmits SOS or changes saved data.

## Walking route recovery check

1. Generate a genuine local Valhalla walking route and explicitly tap **Start walking navigation**. OpenRF still does not request geolocation while merely previewing a route. With accurate (±35m or better), recent GPS **off the mapped walking route**, the HUD should show **Replan walk from here**. This is a user-initiated action, not an automatic reroute, and must never be treated as proof a trail is accessible.
2. Tap Replan to request a **local** pedestrian route from the latest reported position to the same destination. On success, the original follow session ends, the new path is shown with its turns, and you must review it and tap Start again. On failure, the old walking plan and its follow session remain available. Do not try to create a truly off-route test by putting yourself in an unsafe location.
3. A stale GPS fix, reported accuracy worse than ±35m, on-path location, malformed/direct-line route response or existing intermediate stops must not initiate or silently apply a new route. Stopping navigation while a route request is in flight must prevent the response from taking over the map. A desktop mock cannot reproduce real sensor behavior; test with safe stationary or controlled outdoor conditions.
4. Existing optional **Walking breadcrumbs and backtrack** remains a separate, user-started private recording function. Neither walking follow nor manual replan automatically starts breadcrumb recording or saves a location history.

## Automated coverage and limits

```bash
cd /mnt/c/projects/OpenRF
PYTHONPATH=tests:. python3 -m unittest discover -s tests -p 'test_*.py' -q
for file in tests/*.js; do node "$file" || break; done
```

- **383 Python tests** and **105 JavaScript test scripts** passed in the release workspace; new tests: `test_popup_radio_nav_v138.js` and `test_walking_replan_v138.js`.
- The new tests use synthetic route geometry and mock browser/GPS callbacks. They verify button placement in source markup and CSS constraints, not rendered pixel-perfect browser screenshots or physical GNSS/SDR behavior.
- No real Docker/Valhalla request, physical GPS walking trial, Raspberry Pi receiver hardware, trail passability, local access rules or background/screen-off navigation was verified here. Automatic walking rerouting is still not implemented.

## Changed files

- `openrf/static/index.html`, `openrf/static/app.css`, `openrf/static/app.js`
- `openrf/__init__.py` and ZIP-root `openrf-bundle.json` (release/version cache refresh)
- `tests/*.js` and `tests/test_server.py` (version assertions plus two new regressions)
- `README.md`, `CHANGELOG.md`, this release note
