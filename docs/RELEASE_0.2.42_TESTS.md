# OpenRF v0.2.42 — Verification and field checklist

## Changes
- Added `openrf/sdr.py` read-only offline SDR capability contract and `GET /api/sdr/status`.
- Added `openrf/static/spectrum.js` and Spectrum page/controls in `index.html` and `app.css`, navigation `app.js` update.
- Updated `openrf/hardware.py`, `openrf/sensor_connections.py`, `openrf/readiness.py`, README, changelog, manifest and JS/Python tests.
- Preserved prior v0.2.41 source tree including archived Android; no database changes.

## Local validation
From the extracted `project/` directory:

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for f in tests/*.js; do node "$f" || exit 1; done
bash -n tools/setup-valhalla-wsl.sh
```

## Manual test on WSL / Pi once installed
1. Open OpenRF → **Spectrum**. Confirm **LIVE CAPTURE UNAVAILABLE** and no graph sample values until explicitly loaded.
2. Click **Load synthetic DEMO**. Verify distinctive DEMO status, synthetic peaks and waterfall, frame slider and view-only From/To MHz.
3. Click **Clear view**. No saved observations or hardware scan should appear.
4. With a **real previously collected** `rtl_power` CSV of your own, select **Open rtl_power CSV**; review the historical time labels (timezone unverified) and reported dB bins. File is read in your browser only.
5. Open **Hardware**: an installed `rtl_power` command should be reported as **tools present / unverified**, not receiver connected. On WSL without SDR tools, the Spectrum still works with local files.
6. Confirm Map, Valhalla navigation DEMO, saved observations, Wi-Fi/BLE readiness and investigations remain functional.

## Known limitations
- Spectrum and waterfall are OFFLINE FILE or SYNTHETIC DEMO ONLY. No SDR USB opening, tuning, IQ stream, spectrum acquisition, calibrated dBm, antenna properties, transmitter location, bandwidth inference, or scanning is implemented.
- Maximum local CSV 2 MB, 3000 lines, 160 frames and 4096 bins/frame. Malformed rows are rejected; no timezone conversion is performed.
- Browser file import is client-side only: no cloud service, server upload, SQLite writes or automatic exports. Different `rtl_power` versions can produce varying CSV layouts; physical CSV compatibility is unverified.
- Live rtl_power tools, physical SDR sampling, Pi hardware, five-inch Firefox layout, GNSS and other radios were not physically tested here.
- GitHub CI pass is not verified until user's actual push/workflow completes.
