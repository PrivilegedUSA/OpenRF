# OpenRF v0.2.35 — Planned turns and local GNSS bridge

## Implemented and limits

- **Get directions** remains a read-only local Valhalla road-plan request. Its planned turns can be shown in an expandable list and saved/printed as standalone HTML or JSON with explicit coordinate warning.
- **Start navigation** enters an explicit follow view. Even if the position is ±107 m or stale, the banner displays **Planned (not current)** and the full turn list can be expanded. No live turn timing is inferred from imprecise location. Off-route/invalid fixes pause live guidance.
- For fresh accurate *moving* fixes with a real heading (or a heading inferred from two separated reliable moving fixes), the map follows with its marker below center, a forward-looking tilt, and heading-up orientation. No automatic rerouting or voice alerts.
- Optional **gpsd** bridge (`/api/navigation/gnss`) queries only the loopback daemon at 127.0.0.1:2947 with stdlib socket. Endpoint requires the in-app `X-OpenRF-GNSS-Consent: navigation-follow` header. Polling starts only after Start navigation and stops when navigation ends/leaves the Map. No background GPS logging or observations. If gpsd is absent or has no valid TPV/accuracy, browser geolocation remains available.
- Source and age, UTC timestamp, receiver identity, estimated horizontal error in meters, speed (m/s), and heading (degrees) are normalized from gpsd fields. gpsd error estimates may have different confidence definitions; don't interpret them as certified accuracy. No hardware/GPS samples are included.

## Optional Raspberry Pi GNSS requirements

1. Connect a supported GNSS receiver to Raspberry Pi OS (USB/serial, with device permissions configured). Install/configure gpsd and point it at **your actual** device; no device name is hardcoded in OpenRF. The daemon is not installed or started by the OpenRF update.
2. Verify a satellite fix and stable **UTC TPV** reports with `gpspipe -w` (gpsd-clients, if installed). gpsd TPV mode 2/3 and usable coordinates do not by themselves guarantee a usable reported horizontal error; check `epx`/`epy` (or `eph`). If no fixes arrive, check GNSS sky visibility and gpsd device configuration.
3. Start OpenRF on Pi and get a local Valhalla road plan. Press **Start navigation** to opt into GNSS polling. Expand location diagnostics; check `Local GNSS` source and fix quality. Browser location will be used when gpsd has no valid fix.
4. Stop navigation and verify no further `/api/navigation/gnss` polls; leave Map page to stop as well. Existing investigation/observations SQLite data remains unchanged.

## WSL/Firefox checks (no GNSS receiver required)

1. From Ubuntu: `cd /mnt/c/projects/OpenRF && python3 -m openrf`; from PowerShell use `wsl -d Ubuntu -- bash -lc "cd /mnt/c/projects/OpenRF && python3 -m openrf"`.
2. Open `http://127.0.0.1:8765/`, calculate a **regional** road route with Valhalla, review Directions and optionally save HTML (offline usable). Click **Start navigation**.
3. With desktop location ±107 m, confirm **Approximate location** and a separate **Planned (not current)** maneuver plus expandable **Planned turns**. The camera must remain broad north-up; no actual live turn timing. With no location permission, planned turns remain available.
4. With real GNSS and reliable speed/heading on a stationary test device (not while interacting with controls during driving), confirm the camera follows accurately and stops on Stop. No live vehicle testing was carried out in this release.

## Reproducible tests

`python3 -m compileall -q openrf`

`python3 -m unittest discover -s tests -q`

`node --check openrf/static/app.js`

`node tests/test_navigation_follow_v035.js`

Plus the JavaScript suites listed in `.github/workflows/openrf-linux.yml`. No third-party Python runtime dependencies introduced. ZIP root remains `openrf-bundle.json`; protected updater scripts, `.git`, `local-data`, credentials and private GNSS records are not bundled. GitHub CI run/pass must be checked on GitHub after pushing; the prior USB serial test failure is not claimed fixed here.
