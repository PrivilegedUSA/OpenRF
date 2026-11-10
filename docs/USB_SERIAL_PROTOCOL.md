# OpenRF Serial v1 — experimental module interface (v0.2.8)

**Status:** host implementation plus experimental ESP32-S3 source firmware; no physical module verified. No scan occurs until the operator explicitly requests a snapshot. This protocol operates over a USB serial cable; it does not transmit over RF. This is a compatibility protocol, **not authentication**. Device-reported readings may be bogus, stale, or uncalibrated.

## Transport

Linux `ttyACM*` / `ttyUSB*` only, 115200 baud, 8N1, newline-delimited UTF-8 JSON responses; maximum response 32 KiB, up to 128 readings, ~3 seconds per command. Host sends ASCII `OPENRF HELLO 1\n`, reads one JSON object:

```json
{"type":"hello","protocol":"openrf.serial.v1","hardware_id":"example-board","label":"Example USB module","capabilities":["WIFI","BLE","RF"]}
```

An explicit capture opens the port again, performs HELLO, sends `OPENRF SNAPSHOT 1\n`, then reads:

```json
{"type":"snapshot","protocol":"openrf.serial.v1","hardware_id":"example-board","captured_at_utc":"2026-11-10T18:00:00Z","records":[{"kind":"RF","identifier":"example-signal","label":"Receiver reading","frequency_mhz":433.92,"rssi_dbm":-70.5}]}
```

These JSON examples define framing only and **are not real RF readings**. `captured_at_utc` may be omitted; then the host retrieval time is used and freshness remains unknown. Reported timestamps are untrusted; significant future skew falls back to host time, and old captures are marked stale. Only negotiated kinds (`WIFI`, `BLE`, `RF`) and finite, bounded numeric frequency MHz / RSSI dBm fields are accepted. Values are not automatically taken as calibrated. An empty records array is valid and yields a zero-result capture.

**Important:** generic USB receivers, GPS dongles, and ESP32 boards without OpenRF-compatible firmware will not answer this protocol. Experimental ESP32-S3 firmware is included under `firmware/esp32-s3-openrf-serial-v1/`; it requires explicit flashing and has not been compiled or tested on physical hardware. No user-provided measurements can be inserted through these endpoints; the server must obtain them from a currently inventoried USB serial port. The optional browser coordinate is a survey position, never a transmitter location. The local server stays on loopback. For WSL USB forwarding consult Microsoft's usbipd instructions; do not expose the local development API to a LAN.

## v0.2.8 firmware extension and failure handling

The ESP32-S3 responds to `HELLO` with `capabilities:["WIFI"]`, optional `firmware_version:"0.2.8"`, and `scan_mode:"passive_2g4"`. Only a requested SNAPSHOT triggers a passive, 2.4 GHz-only Wi-Fi survey. Device output has no trustworthy UTC clock, so the `captured_at_utc` field is omitted and the host stores host retrieval time with `UNKNOWN` freshness. The 32-AP maximum is a firmware cap, not a guarantee of completeness. RSSI is device-reported, uncalibrated dBm, not signal quality percentage.

A firmware scan failure uses `{"type":"error","protocol":"openrf.serial.v1","code":"WIFI_SCAN_FAILED"}` (other uppercase underscore error codes also possible). Such errors are rejected and do **not** create a saved snapshot. A real zero-result scan instead returns an empty `records` array. An ESP32 board that is present in Linux inventory but lacks correct firmware is not a connected OpenRF sensor.
