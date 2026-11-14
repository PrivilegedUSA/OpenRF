# OpenRF v0.2.59 — release tests, safety and limitations

## Local tests from the ZIP `project/` folder

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
node --check openrf/static/app.js
node --check openrf/static/route_guidance.js
for f in tests/*.js; do node "$f"; done
bash -n tools/setup-valhalla-wsl.sh
```

## Interactive validation (parked or passenger; never operate the touchscreen while driving)

1. Launch Docker Desktop and the **existing** Northern California Valhalla graph; confirm `tools/setup-valhalla-wsl.sh --doctor` can route Sacramento to Auburn. OpenRF stays bound to localhost.
2. Plan a genuine road route, then **Start navigation**. The new Voice off button must be opt-in. Enable it using a deliberate tap. Confirm the browser/OS reports speech availability. A test with no voice engine should show an unavailable message, with directions remaining visible.
3. Feed controlled fresh precise *moving* GPS/GNSS fixes approaching two turns. Verify spoken prompts only near 400 m and 90 m for each turn, at most once per checkpoint. Stale, imprecise, stationary, off-route and DEMO fixtures must not speak. Stop and page changes must cancel any queued speech. Real-world speech playback remains unverified.
4. Check `turn_lanes:true` in the loopback Valhalla request. When the graph supplies lane metadata, show source-derived arrows and distinguish preferred/valid from unknown. Where the graph does not supply it, show **no lane guidance**. Road signs override suggestions.
5. ETA text must say no live traffic. The map must never display inferred traffic, incident speeds or lane closures. ALPR/camera comparison and automatic rerouting must remain functional with no new background network requests or GPS saving.
6. Check 800×480 and phone layout so navigation voice and lane panel do not overlap right-side zoom/recenter. Offline basemap tiles and archived Android source must be unchanged.

## Limits and licensing

- Speech uses the browser's `speechSynthesis`, not a bundled/local guaranteed voice. Depending on installed voices and browser OS, actual playback may require connectivity; there is **no guarantee of offline synthesized speech** without a local voice. Browser/OS speech behavior is outside OpenRF's control. Speech is optional, user-enabled each navigation session and does not upload or persist GPS in OpenRF.
- `turn_lanes` is present in recent Valhalla builds; lane metadata depends on OSM tags and Valhalla graph coverage. No lane geometry, lane-level map matching or guaranteed lane safety is inferred. Synthetic test fixtures do not establish real lane coverage.
- The ETA is a proportional estimate from the current road plan, not a live traffic speed prediction. There is no connected live traffic provider, live incidents or traffic-aware rerouting. Integrating one later requires data provider permissions, opt-in connectivity and explicit provenance/staleness displays.
- Unit tests, parser tests and isolated browser layout checks are not physical GNSS driving, real browser voice audio, Raspberry Pi, external routing API, or GitHub Actions verification. No new Python dependencies, hidden telemetry, private credentials or large routing archives included.
