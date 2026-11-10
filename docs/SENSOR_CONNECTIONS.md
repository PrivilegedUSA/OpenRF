# OpenRF Sensor Connection & Observation Contract (v0.2.7)

OpenRF runs offline with no sensor hardware. WSL usually exposes no Linux Wi-Fi or BLE radio from the Windows host. Hardware inventory is **not** a scan. Implemented adapters are a user-triggered NetworkManager Wi-Fi AP list and an **opt-in USB-serial protocol** requiring separately developed OpenRF-compatible firmware. No compatible serial hardware has been verified.

## API and source states

- `GET /api/sensors`: versioned adapter registry. `ready` means prerequisites are visible **not** scan-tested. BLE, SDR, GNSS remain `not_implemented`; `openrf-serial-v1` is not connected unless a compatible responding sensor is manually probed.
- `POST /api/wifi/scan`: one explicit Wi-Fi survey (`nmcli`, with a visible Linux Wi-Fi interface); returns a list, server-generated opaque `scan_id`, interface ID, UTC retrieval timestamp, freshness warning, and percent signal quality. Rate-limited to 15 seconds.
- `POST /api/sensors/networkmanager-wifi/save`: reference an observed BSSID and matching scan receipt. Only one save for each BSSID per scan; the receipt expires after ten minutes or on server restart/new scan. Rejects arbitrary sensor readings or unknown scan IDs.
- Optional `survey_location` from the browser consists of latitude, longitude and accuracy in meters; it's **client-reported**, cannot be independently authenticated as GNSS, and never implies transmitter location. Missing coords are valid and saved without a map pin.
- Source is `SENSOR`, device is the Linux interface reported by NetworkManager, and observation time is the *scan retrieval time*. A cached entry could be older. `signal_quality_percent` is **not** equivalent to RSSI in dBm, so `rssi_dbm` remains null. Frequency in MHz and quality in percent retain their units.
- The server remains bound to 127.0.0.1; Host/Origin and JSON validation remain in force. No account, upload, background survey or wireless raw-frame interception.

## Future adapter requirements

Each new driver should expose a stable ID, supported capabilities and bands, driver/firmware identity where available, connection status, instrument-specific units, UTC measurement timestamp, validity/freshness flags, GNSS fix age/accuracy, and provenance. An observation may be absent or unknown, but must never be manufactured. A receiver's survey location must never be equated with a transmitter position. BLE, rtl-sdr, CC1101 and modem sources are **not implemented** here.

When physical sensors become available, test driver permission flows, disconnections, calibration, duplicate/stale behavior, and recorded-session integration separately before labeling them supported.

## v0.2.6 survey capture API (implemented)

- `GET /api/sensors/diagnostics`: read-only capability prerequisites and last *successful one-shot retrieval* metadata for this server process. No measurement or RF capability is inferred from inventory alone.
- `POST /api/sensors/networkmanager-wifi/save-scan`: accept **only** a server-generated, unexpired `scan_id`, an optional active `session_id`, and an optional `survey_location`. The client cannot submit observation values. All as-yet-unsaved verified rows from the receipt are stored in one database transaction, and the receipt becomes single-use. A zero-result retrieval remains a capture with `saved_count=0`.
- `GET /api/captures`: newest 500 saved survey captures, including source ID, Linux interface, UTC retrieval and persistence times, signal freshness warning, returned/saved counts, optional session link and observer-coordinate provenance. No spectrum samples or transmitter positions are invented.
- `GET /api/observations`, CSV, GeoJSON: saved grouped rows carry `signal_quality_percent`, `survey_capture_id`, `location_source`, `fix_age_seconds`. `rssi_dbm` is **null** for NetworkManager readings because its SIGNAL field is quality percent, not received power. Existing records are preserved by additive SQLite columns.
- For v0.2.6 NetworkManager snapshot capture, browser coordinates must include `latitude`, `longitude`, `accuracy_m` and `fix_age_seconds` between 0 and 60. The frontend latches the browser position **at scan request time**; location obtained afterward cannot be attached retroactively. `location_source=BROWSER_REPORTED` does **not** claim a verified GNSS fix. No location attaches unless the user selects the checkbox and confirms.
- On a machine with no Linux wireless interface, scanning returns an error and snapshot saving remains disabled. A scan may trigger normal Wi-Fi probes and NetworkManager may return cached data; readout time is not necessarily beacon reception time. Raw frame acquisition and continuous GPS logging remain unimplemented.

## v0.2.7 OpenRF Serial v1

A selected inventoried Linux USB-serial port can be probed and queried for one snapshot, strictly on user request. The protocol specification and cautionary notes are in [USB_SERIAL_PROTOCOL.md](USB_SERIAL_PROTOCOL.md). A successful handshake does not verify vendor identity or prove the data are genuine live RF observations. One-shot saved records are marked unverified and use observer coordinates only when the browser has a recent fix explicitly selected. No module firmware is supplied or tested.
