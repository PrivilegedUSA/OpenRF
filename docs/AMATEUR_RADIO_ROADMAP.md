# OpenRF: optional amateur radio receiver/transceiver integration (proposal only)

**Status in v0.2.49: PROPOSED / NOT IMPLEMENTED.** The Spectrum workspace already has bounded `rtl_power` sweeps, but it does **not** play radio audio, decode voice, or transmit. No radio appears connected merely because this document is installed. A Raspberry Pi by itself is not an RF receiver or a legal amateur transceiver.

## Staged approach

1. **Receive-only tuning and audio**: integrate a compatible USB RTL-SDR receiver with `rtl_fm` or another supported offline demodulator; verify Linux/WSL USB access; start with FM voice modes, supported frequency ranges and actual audio playback. Dedicated controls: tune, mode, gain and squelch, start/stop audio, actual device identity and failures. Use an appropriate antenna and listening speaker/headphones. Limit runtime, report no signal or no hardware honestly; never label synthetic recordings as live. HF, sideband and other modes depend on tuner, filters, demodulator quality and hardware, not merely software selection.
2. **Channel presets and evidence labeling**: locally saved frequency/mode presets, optional operator labels and UTC-aware observations. Do not auto-record calls or upload audio. Keep any consent-sensitive recordings and local station data outside Git. Do not identify a person/transmitter from RSSI or unverified audio.
3. **External ham transceiver (read-only first)**: optional USB/serial CAT connection, ideally via locally bound Hamlib `rigctld` to query frequency, operating mode, signal-meter values where supported. A CAT connection is not a guarantee of transmitter RF capability or signal quality. Restrict to selected, user-owned gear; no network-wide exposed CAT port.
4. **Opt-in transmit integration (far later)**: design separate authenticated, licensed operator-controlled features for supported transceivers only. Require explicit human PTT action, regulatory checks appropriate to location/operator/band, hardware safety/interlocks, and emergency stop. No automatic transmissions, jamming, broad-band IQ transmission, replaying captured access controls or remote unattended transmit feature. No transmit capability in current patch.

## Choices & limitations

- An ordinary RTL-SDR dongle is **receive-only**. `rtl_fm` can demodulate narrowband FM and broadcast-wideband FM, with experimental AM/sideband modes; not all hardware covers every amateur band. It does not enable transmitting.
- External ham rigs may have USB CAT control and audio interfaces; control support and legal usage depend on specific model and radio service. Hamlib `rigctld` is a well-documented open-source interface but its TCP socket should remain **localhost-only**.
- USB access from Windows via Ubuntu WSL is not automatic. Native Raspberry Pi OS and verified supported USB drivers are preferred for real RF audio reception. Antenna position and device calibration affect reception.
- Radio monitoring and recording rules vary by jurisdiction and service. US amateur **transmission** requires operator privileges and complying with 47 CFR Part 97. OpenRF must not infer that permission exists from the presence of a receiver.

## References / license review

- Osmocom RTL-SDR `rtl_fm` manual: https://github.com/osmocom/rtl-sdr/blob/master/debian/rtl_fm.1
- Hamlib `rigctld` manual: https://hamlib.sourceforge.net/html/rigctld.1.html
- US Amateur Radio Service regulations: https://www.ecfr.gov/current/title-47/chapter-I/subchapter-D/part-97
- When integrating `rtl_fm`/Hamlib binaries or code, document separately installed tools and comply with their licenses; do not silently vendor third-party binaries.
