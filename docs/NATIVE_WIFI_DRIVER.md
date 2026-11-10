# Native Linux Wi-Fi survey — OpenRF v0.2.2

**Implementation:** `openrf/drivers/wifi_nmcli.py` with `POST /api/wifi/scan`. This is an explicitly requested, single NetworkManager access-point enumeration. It does not capture raw frames, decode hidden protocols, or provide transmitter locations.

## Eligibility

- A Linux-visible Wi-Fi adapter under `/sys/class/net/<interface>/wireless` or `phy80211` is required.
- `nmcli` (NetworkManager) must be present and able to query the interface as the logged-in user.
- WSL normally exposes `eth0`, not the Windows host's radio as a Linux Wi-Fi interface. Therefore this API normally returns HTTP 409 on WSL. An adapter being visible does not guarantee successful scanning.
- This is not a Bluetooth, SDR, GPS, sub-GHz, or 5G driver.

## Trigger and result

The Scanner button **Scan Wi-Fi once** calls `POST /api/wifi/scan` with `{}`. A single `nmcli --terse --escape yes --fields SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY device wifi list ifname <interface> --rescan yes` command runs with a 12-second timeout, no shell, and no elevated privileges. Only an interface discovered in Linux sysfs may be used. Calls are serialized and limited to one request every 15 seconds. `nmcli` may trigger standard active Wi-Fi probe requests; do not call it passive radio capture.

Data returned: SSID, BSSID, frequency MHz, channel, signal quality **percent** (NOT dBm), security, chosen Linux interface and retrieval timestamp UTC. The actual beacon age is unknown: NetworkManager may return cached entries. No GPS fix or transmitter location is inferred or fabricated. Results are displayed temporarily, not saved to SQLite, sessions, map, or exports.

If the interface or utility is missing, permission is insufficient, the process errors, or it times out, the API reports an error and displays **no fabricated data**.

## Follow-on work

Actual driver exercise on native Linux/Pi hardware; multi-interface selection and capability negotiation; optional recorded results with explicit provenance and UTC measurement timestamps; BLE (BlueZ), RTL-SDR and external GNSS support. Hardware availability cannot be claimed on WSL without a forwarded supported receiver and tested driver.
