# OpenRF Sensor Connection & Observation Contract (v0.2.5)

OpenRF runs offline with no sensor hardware. WSL usually exposes no Linux Wi-Fi or BLE radio from the Windows host. Hardware inventory is **not** a scan. This release implements only one optional live Linux adapter: a user-triggered NetworkManager Wi-Fi AP list.

## API and source states

- `GET /api/sensors`: versioned adapter registry. `ready` means prerequisites are visible **not** scan-tested. BLE, SDR, GNSS remain `not_implemented`.
- `POST /api/wifi/scan`: one explicit Wi-Fi survey (`nmcli`, with a visible Linux Wi-Fi interface); returns a list, server-generated opaque `scan_id`, interface ID, UTC retrieval timestamp, freshness warning, and percent signal quality. Rate-limited to 15 seconds.
- `POST /api/sensors/networkmanager-wifi/save`: reference an observed BSSID and matching scan receipt. Only one save for each BSSID per scan; the receipt expires after ten minutes or on server restart/new scan. Rejects arbitrary sensor readings or unknown scan IDs.
- Optional `survey_location` from the browser consists of latitude, longitude and accuracy in meters; it's **client-reported**, cannot be independently authenticated as GNSS, and never implies transmitter location. Missing coords are valid and saved without a map pin.
- Source is `SENSOR`, device is the Linux interface reported by NetworkManager, and observation time is the *scan retrieval time*. A cached entry could be older. `signal_quality_percent` is **not** equivalent to RSSI in dBm, so `rssi_dbm` remains null. Frequency in MHz and quality in percent retain their units.
- The server remains bound to 127.0.0.1; Host/Origin and JSON validation remain in force. No account, upload, background survey or wireless raw-frame interception.

## Future adapter requirements

Each new driver should expose a stable ID, supported capabilities and bands, driver/firmware identity where available, connection status, instrument-specific units, UTC measurement timestamp, validity/freshness flags, GNSS fix age/accuracy, and provenance. An observation may be absent or unknown, but must never be manufactured. A receiver's survey location must never be equated with a transmitter position. BLE, rtl-sdr, CC1101 and modem sources are **not implemented** here.

When physical sensors become available, test driver permission flows, disconnections, calibration, duplicate/stale behavior, and recorded-session integration separately before labeling them supported.
