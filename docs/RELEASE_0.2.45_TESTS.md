# OpenRF v0.2.45 — RTL-SDR short capture / test guide

## Scope

- Explicitly requested bounded `rtl_power` captures; **not** continuous streaming, wireless targeting, or receiver-auto-discovery.
- User selects an integer MHz lower/upper bound, integer 25–500 kHz step and 5–30-second duration, at most 2048 nominal bins. Driver requests receiver **index 0**. The 24–1766 MHz software guard is **not a verified RF coverage specification**.
- When receiver tooling is not present, the Start button is disabled; file import and DEMO remain available. Installed CLI tools are a prerequisite, not proof of an attached receiver or successful RF measurement.
- Capture only counts as complete when the `rtl_power` process exits successfully *and* its CSV contains parseable spectrum rows. Bounded 2 MB CSV max. Unsuccessful or stopped CSV output is removed; metadata remains deletable. A process exceeding the duration plus timeout is forcibly stopped.
- CSV and metadata are saved under `<private-db-parent>/sdr-captures`, by default `~/.local/share/openrf/sdr-captures`. This data is not exported to Git, not put in the project ZIP, and not inserted into the observation SQLite tables. Saved entries can be reviewed, downloaded or deleted manually. Up to 50 capture metadata entries, including unsuccessful attempts, are retained before more captures are blocked.
- CSV timestamps have unknown source timezone; UTC capture start/end times are server process times, **not** per-bin sampling times. Reported dB is not calibrated dBm. No receiver hardware ID, transmitter direction/range, location or signal identity is established.

## Automated smoke/regression tests (Ubuntu/WSL)

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for t in tests/*.js; do node "$t"; done
node --check openrf/static/spectrum.js
bash -n run-openrf.sh tools/setup-valhalla-wsl.sh
```

Software-only v0.2.45 test coverage includes input allowlisting, invalid CSV rows, no installed executable, fake capture-process success, process stop, process output failure, duplicate-scan contention, private storage/delete, hostile Origin rejection, HTTP valid/invalid capture IDs, existing hardware readiness and all earlier maps, navigation and surveys. The stub writes hardcoded CSV rows and is **NOT** a hardware scan. No on-device RF measurement is claimed.

## Manual hardware tests required before claiming receiver support

1. Install update via the reserved Windows updater. Restart Ubuntu server; hard-refresh the browser and open **Spectrum**. Without `rtl_power` installed, capture Start stays disabled while historical CSV import and synthetic DEMO work.
2. Optional: `command -v rtl_power` inside Ubuntu. When intended RTL-SDR hardware is available in Linux (Raspberry Pi USB or explicitly attached WSL USB device), verify Linux permissions and check `rtl_test` outside OpenRF before an authorized capture. Some tuners/bands/gains may be unsupported; those need actual testing.
3. Press **Start short capture** with known safe receiving range, then **Stop** early. Confirm partial data isn't displayed as verified. Start again, let the 10-second sweep complete, check for actual valid CSV rows and the **RECORDED · NOT LIVE** banner. A failed run must show failure, not an invented signal.
4. Review saved capture, download and inspect CSV, delete unwanted recordings. Confirm no private CSV is inside the Git/source ZIP and no observation or map marker was created merely by capture.
5. Test 800×480 5-inch layout in Firefox/on a Pi, map-first navigation, offline tile sources, BLE/Wi-Fi/USB one-shot controls and other existing workflows. These were not physically confirmed here.

## Release packaging / preserved files

No required new Python or JS dependency, no SQLite schema migration and no changes to map MBTiles/vector resources. Keep `.github`, `legacy/`, firmware, tests and docs in the `project/` subtree. ZIP root is exactly `openrf-bundle.json` with version 0.2.45 and the managed `project/` tree. Do **not** place `Update-OpenRF.ps1`, `Setup-OpenRF.ps1`, `.git/`, `.openrf-state/`, personal data, credentials or captures in release ZIP.

**Not verified:** real RTL-SDR hardware, WSL USB passthrough, Pi OS receiver, RF capture quality, signal identity, exact frequency coverage, live 5-inch screen, upstream GitHub CI, user's installation or push. A successful local ZIP/test run proves only the software contract tested here.
