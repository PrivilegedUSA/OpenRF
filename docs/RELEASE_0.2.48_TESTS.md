# OpenRF v0.2.48 — Recorded frequency-bin history

## Implemented

- **Spectrum → Recorded frequency history across saved sweeps** (expand at bottom of Review & compare) is an **on-demand, read-only** browser-local review of a requested exact frequency-bin center across the most recent **16 completed saved RTL-SDR** captures. It never requests a receiver scan. Choose an investigation (including closed sessions or no investigation), enter the frequency in MHz (up to six decimals), then press **Analyze saved sweeps**.
- Exact bin centers are matched to 1 Hz. Missing bins are **skipped, not zero-filled**; the UI counts missing bins, different tuning, unreadable captures and the cap of 16. The optional matching requested sweep start/stop/step setting guard is **on by default**, avoiding many misleading comparisons. Changing the selected frequency/filters or modifying saved captures clears stale analysis and disables export.
- A compact capture-order line chart, accessible horizontal-scroll table and optional CSV export show mean/min/max reported dB and per-bin sample counts for each capture plus the server-recorded capture-start UTC. An optional browser site is indicated only by **reported accuracy**, not by coordinates. CSV export excludes all latitude/longitude. A location report is *not* verified receiver antenna location or transmitter location. CSV internal frame timestamps have unknown time zone.
- The browser fetches only existing saved local CSVs from the loopback API. Invalid/unreadable/failed/stopped recordings and synthetic DEMO cannot enter history. No server capture state is modified and nothing is silently stored as an observation.
- **Bug fix:** Explicitly allowlist and serve `spectrum-analysis.js` (from the earlier v0.2.46 feature) and new `sdr-history.js` through the backend's restricted static route. Prior source-only JS tests did not catch the missing allowlist entry. Static whitelist remains narrow; no arbitrary path access.

## Tests and review

Run in Ubuntu / WSL:

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file"; done
node --check openrf/static/spectrum.js
node --check openrf/static/spectrum-analysis.js
node --check openrf/static/sdr-history.js
bash -n run-openrf.sh
```

- Includes new `tests/test_sdr_history_v048.js`: real CSV syntax but deterministic *fixture* samples (not real reception); mean/min/max, 1 Hz exact-match, no interpolation/zero fill, same-tuning exclusion, non-completed/DEMO rejection, export coordinate exclusion and UI contracts.
- HTTP server `tests/test_server.py` now requests both static JS modules in addition to the prior scripts; verifies HTTP 200 in the real loopback server rather than merely checking file existence.
- Chromium 800×480 browser smoke (script not included in release) uses actual HTML/CSS/spectrum/history modules and mocked local API returning two deterministic CSV fixtures; tests investigation selection, timeline, no calls to the start-capture API, chart/table, changing frequency invalidates export and no page errors. A screenshot of the controlled test was inspected.
- Final release audit: manifest `0.2.48`, all v0.2.47 managed file paths retained, offline map MBTiles/assets byte-identical, no `.git`, updater scripts, local data, secrets, SQLite DBs, pycache, generated captures; ZIP CRC and test results on extraction.

## User smoke test

1. Stop OpenRF with Ctrl+C. Save `OpenRF-v0.2.48.zip` to Downloads. Install from Windows PowerShell with the existing `Update-OpenRF.ps1`, restart Ubuntu with `cd /mnt/c/projects/OpenRF && python3 -m openrf`, hard-refresh <http://localhost:8765>. Header should say 0.2.48.
2. Open **Spectrum**. Historical CSV loading and the previous strongest-bin comparison should work again under the normal server (not just in an isolated browser test).
3. Expand **Recorded frequency history across saved sweeps**. With no completed captures, Analysis should clearly say zero matched. With at least two completed saved RTL-SDR sweeps that share a bin center, enter a center frequency within the sweep, optionally filter investigation, and press **Analyze saved sweeps**. A matching bin center often lies half a step above the low frequency (e.g., an 88 MHz low end and 100 kHz bins may have a center at `88.050000` MHz). Bins must *actually be present* in the files; tuning settings alone do not guarantee matches.
4. Verify the chart/table are marked **RECORDED · NOT LIVE**. Changing frequency clears old results and disables CSV export. Reanalyze and check optional CSV has no latitude/longitude. Verify old map/offline maps, navigation, receiver controls and browser-location opt-in remain unchanged.

## Explicit limits

- No physical RTL-SDR, Raspberry Pi, actual radio observations, real GPS, USB passthrough, signal calibration, verified antenna position or GitHub CI deployment was tested. Fixture values are only a repeatable test input and are not surfaced as real RF data in production.
- Arithmetic mean of rtl_power-reported dB is **not calibrated dBm**, and even exact bin matches across different recordings do not establish a changed transmitter. Variation in receiver gain, antennas, sampling environment, equipment and tuning can dominate. No signal identity, proximity, tracking, heatmap, triangulation, passive device detection or emitter localization is implemented by this patch.
