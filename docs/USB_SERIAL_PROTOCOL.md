# OpenRF Serial v1 — experimental module interface (v0.2.7)

**Status:** host implementation only, no physical module or firmware verified. No scan occurs until the operator explicitly requests a snapshot. This protocol operates over a USB serial cable; it does not transmit over RF. This is a compatibility protocol, **not authentication**. Device-reported readings may be bogus, stale, or uncalibrated.

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

**Important:** generic USB receivers, GPS dongles, and ESP32 boards without OpenRF-compatible firmware will not answer this protocol. No firmware is included in this release. No user-provided measurements can be inserted through these endpoints; the server must obtain them from a currently inventoried USB serial port. The optional browser coordinate is a survey position, never a transmitter location. The local server stays on loopback. For WSL USB forwarding consult Microsoft's usbipd instructions; do not expose the local development API to a LAN.
