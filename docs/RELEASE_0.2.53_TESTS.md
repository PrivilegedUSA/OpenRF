# OpenRF v0.2.53 — Receive-only Radio workspace

## Added and changed managed files

- **Added:** `openrf/radio.py`, `openrf/static/radio.js`, `tests/test_radio_v053.py`, `tests/test_radio_frontend_v053.js`, this test guide.
- **Changed:** `openrf/server.py`, `openrf/__init__.py`, `openrf/static/index.html`, `openrf/static/app.js`, `openrf/static/app.css`, `README.md`, `CHANGELOG.md`, `docs/AMATEUR_RADIO_ROADMAP.md`, `docs/THIRD_PARTY.md`, preexisting tests with versioned asset assertions.
- **Not changed:** MapLibre/vector and raster map assets, 800×480 map tool design, offline map tiles, existing saved investigations, firmware or legacy Android archive.

## Software and simulated test

From the `project/` folder after extracting the release:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -q
for f in tests/*.js; do node "$f"; done
python3 -m compileall -q openrf
node --check openrf/static/radio.js
```

- Python test stubs produce **synthetic PCM, never live receiver readings**; validate exact allowed fields, unavailable tooling, stops and bounded memory WAV output, explicit host/origin checks, and radio-vs-spectrum mutual exclusion.
- Frontend source test checks tuner controls, only self-hosted audio and opt-in start. Isolated Chromium checks at 800×480, 390×844 and 1450×900 cover responsive layout, status refresh and preset selection; these are **not** proof of audio reception or end-to-end device behavior.

## Manual test with no physical RTL-SDR

1. Install via Windows updater. Start `cd /mnt/c/projects/OpenRF && python3 -m openrf` in Ubuntu/WSL; browse `http://localhost:8765`.
2. Open **Radio** from menu. Check NFM, AM and WFM, example presets and status. Opening the page must not initiate a receive operation.
3. If `rtl_fm` is missing, click **Receive short sample** and confirm the explicit tool-missing error (not fake audio).
4. Check that the **Map** still opens with the compact “Where to?” search bar and unified right-side controls. Verify **Spectrum** still loads previous saved captures and reports hardware unavailable without a dongle.

## Optional real hardware test (not run for this release)

1. On Ubuntu or Raspberry Pi OS, install the distro's `rtl-sdr` package and connect a supported USB RTL-SDR dongle with suitable antenna. Confirm `command -v rtl_fm`; on WSL configure USB passthrough separately.
2. Choose a known legal-to-monitor local transmission, set frequency/mode, start a 5-second receive sample. Wait for completion, click browser Play (never autoplay). Use hardware output only; silence/noise is possible and not an RF classification.
3. Verify **Stop** discards incomplete audio; verify no sample survives a server restart and only loopback access works. No calibrated level, identity, transmission, audio history, continuous streaming, or ham CAT functionality is provided.

## Limits

No physical RF receiver, WSL USB passthrough, Raspberry Pi touchscreen, broadcast audio reception, listening-law audit or GitHub Actions run was verified. A valid output WAV can contain silence or noise. No recorded raw PCM, callsigns, station identifiers or GPS positions are added to OpenRF's database.
