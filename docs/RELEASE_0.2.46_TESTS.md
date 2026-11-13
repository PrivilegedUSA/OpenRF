# OpenRF v0.2.46 — Offline SDR bin analysis and comparison / test guide

## Implemented in this release

- **Spectrum → Review & compare frequency bins:** browser-local aggregation of user-loaded `rtl_power` CSV or clearly labeled synthetic DEMO frames. Display the median of mean reported dB across unique frequency bins and the strongest spaced mean-dB bins, with per-bin sample counts and a frame count. Analysis uses the currently selected display-frequency window; the slider still selects individual waterfall/spectrum frames, not the analysis span.
- **Compare with an earlier capture or CSV:** choose another private `rtl_power` recording from the existing saved-captures API, or choose a second local historical CSV via the browser. Press **Compare loaded vs baseline** explicitly. The browser parses the source and baseline, matches frequency-bin centers at 1 Hz, refuses fewer than three matching bins or less than 60% coverage of the smaller frequency grid, and does **not** interpolate mismatches.
- Shows the median of aligned current-minus-baseline reported-dB differences and the largest spaced absolute changes; **Export comparison CSV** writes every aligned bin plus per-source sample counts to a local file. The export header marks any DEMO inputs and warns that power is not calibrated dBm. Source files are never uploaded; no changed readings are automatically added to investigations, live sensor data, maps or SQLite.
- Comparisons reset whenever the current loaded spectrum, selected baseline, or frequency viewing range changes, as well as when a selected saved baseline is removed. Existing captures, status checks and opt-in capture controls remain unchanged.
- Update stale field-survey receiver / hardware information that previously said all spectrum captures were unimplemented. Hardware tool presence alone still does not verify a connected receiver.

## Analysis boundaries

- rtl_power CSV timestamps are treated as **timezone unverified**. The browser does not infer observer coordinates, direction, transmitter identity, distance, signal type or a live measurement.
- Means and differences are **arithmetic calculations on the receiver-reported dB values**. They are not calibrated radio power or guaranteed comparable between receivers, gain/AGC, antennas, weather, locations and setups. A changed dB bin does **not** prove a new emitter. Frequency values are rounded to 1 Hz for strict matching; no calibration, frequency drift correction, resampling, noise subtraction, averaging in linear power, or automatic classification is implemented.
- User must initiate baseline selection and comparison. Both data sources remain in browser memory (saved capture CSV is already available from the existing loopback-only capture endpoint; local CSV remains browser-local). No network calls beyond the local API, no extra dependencies, DB migration or scheduled scans. Synthetic DEMO remains labeled separately.
- Browser source/compare files have existing 2 MB and 160-frame parsing limits; untrusted numeric contents are validated and displayed with `textContent` rather than HTML injection. The comparison supports up to 4,096 distinct center frequencies per input. The mobile comparison table scrolls horizontally on narrow screens.

## Verification executed on this source bundle

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for t in tests/*.js; do node "$t"; done
node --check openrf/static/spectrum.js
node --check openrf/static/spectrum-analysis.js
bash -n run-openrf.sh tools/setup-valhalla-wsl.sh
```

- 181 Python tests passed, including existing capture-process stub tests, API safety, maps/routing, GNSS, BLE/Wi-Fi and storage contracts.
- 25 JavaScript test suites passed, including added `tests/test_sdr_analysis_v046.js`: exact match, averaging, DEMO provenance, incompatible grids, browser model/UI contract and numeric CSV export.
- A sandbox Chromium smoke test at **800×480** passed for the isolated Spectrum UI: DEMO label, local CSV load, local baseline selection, 6 aligned bins, export button activation, clearing a stale comparison and no page JavaScript exceptions. The full locally served page was not browsable from the sandbox (browser navigation blocked); this smoke test used the actual HTML, CSS and JS loaded into an in-memory page with stubbed existing API responses. A live local HTTP server was separately probed successfully with Python. This is **not** an end-to-end test of an actual Raspberry Pi or user's local web browser.
- All six v0.2.45 offline map resource files and every preexisting managed source path were retained; version/manifest and packaging checks conducted before delivery. Private recordings, sqlite files, credentials, `.openrf-state`, updater scripts, `.git`, caches and temporary test artifacts must remain outside the release ZIP.

## Suggested user smoke tests after installing in Ubuntu/WSL

1. Stop the existing server via Ctrl+C. Run Windows `Update-OpenRF.ps1` with `OpenRF-v0.2.46.zip` in Downloads; then restart Ubuntu with `cd /mnt/c/projects/OpenRF && python3 -m openrf` and hard refresh the browser. Verify the header says **0.2.46**.
2. Open **Spectrum**, load **SYNTHETIC DEMO**, scroll to **Review & compare frequency bins** and check that strongest bins display `SYNTHETIC DEMO · NOT MEASURED`. Load a real saved capture or a historical CSV and confirm it switches to `RECORDED / HISTORICAL · NOT LIVE`.
3. Expand **Compare with an earlier capture or CSV**, choose a DIFFERENT saved capture or an independent local CSV from the same tuning and bin spacing, and press **Compare**. Inspect matched-bin coverage, signs of differences and export. Changing displayed From/To MHz must disable/clear the prior comparison. Compare a mismatched CSV and confirm it is rejected, not interpolated.
4. Test both narrow 800×480 and desktop layouts; inspect existing offline maps, navigation, hardware inventory, investigations and RTL-SDR start/stop UI. The new analysis does not request RF capture or save an observation.

## Explicit limitations

No physical RTL-SDR receiver, WSL USB passthrough, antenna or Pi OS driver was exercised; no actual RF power values, signal identities, location, or exact device coverage were verified. No real field GNSS or 5-inch physical touch panel, upstream GitHub Actions result, user's installation, commit or push is claimed. Existing generic resource warnings about unclosed SQLite connections may appear in the Python suite; tests still pass. Browser UI smoke used controlled CSV fixtures, not received radio data.
