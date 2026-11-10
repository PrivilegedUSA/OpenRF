# OpenRF ESP32-S3 passive Wi-Fi serial firmware — v0.2.8

**Source provided, not flashed or tested on a physical ESP32-S3.** This is the first experimental receiver firmware for the existing host-side `openrf.serial.v1` interface. It works only with **ESP32-S3** hardware and the Espressif **Arduino-ESP32 3.x** core; do not select a generic ESP8266, classic ESP32 or ESP32-C3 board. Board-specific USB behavior may vary.

## Flash using Arduino IDE

1. Install official **Espressif esp32** board support for Arduino IDE 2.x (Arduino Boards Manager). Select your actual **ESP32-S3** board, and configure native USB serial / **USB CDC On Boot: Enabled**. USB mode varies by board; use a mode where `Serial` is exposed as a Linux `ttyACM*` (or a bridge as `ttyUSB*`).
2. Open `esp32-s3-openrf-serial.ino` and upload over the board's supported programming USB connection. This is an optional firmware installation, **not** performed by the OpenRF PowerShell updater. Ensure adequate USB power and close Serial Monitor before OpenRF probes the device.
3. On native Linux or Raspberry Pi OS, check `ls /dev/ttyACM* /dev/ttyUSB*` (only existing nodes will print). Launch OpenRF → Hardware → Refresh inventory → choose an accessible port → **Probe sensor**. A successful hello should advertise **WIFI** only and firmware **0.2.8**. Then select **Capture one snapshot** if you want to save a single survey.
4. In WSL2, Windows does not automatically forward the USB board to Ubuntu. Use a supported `usbipd-win` release from an administrator Windows PowerShell to inspect/attach the USB device to WSL as appropriate for your system, and then refresh OpenRF. Do not guess or share a USB BUSID; follow the current official usbipd instructions for the installed version. If Linux access is denied, check `ls -l /dev/ttyACM0` (or the actual device node) and `id -nG`, then configure your distro's appropriate `dialout`/`uucp` membership or udev rules. Re-login or restart WSL after group membership changes; avoid `chmod 777` on device nodes.

## Behavior and limitations

- **Only the explicit `OPENRF SNAPSHOT 1` USB command triggers a 2.4 GHz passive Wi-Fi AP scan** (`WIFI_SCAN_TYPE_PASSIVE`); no background scanning, Wi-Fi association, authentication attacks, deauthentication, packet interception, or RF transmission features are implemented. Regular Wi-Fi scan APIs still require radio reception and driver functions, and no hardware RF test was conducted.
- Returns up to **64** measured AP entries per snapshot as `kind=WIFI`, BSSID identifier, ASCII-sanitized SSID label, frequency **MHz**, and ESP-IDF-reported receive power **dBm**. SSIDs are arbitrary bytes and lossy ASCII conversion is intentional. More than 64 APs are truncated, **not** a claim that only 64 exist. Empty results are allowed.
- ESP32-S3 Wi-Fi does **not** provide general-spectrum SDR, 5/6 GHz Wi-Fi, BLE scanning, sub-GHz, cellular, GNSS or directional ranging. BLE is not announced in this version. A BSSID identifies a reported Wi-Fi transmitter identity, **not a verified physical place or surveillance camera**. RSSI is uncalibrated and not distance or direction.
- The firmware has no verified UTC clock or GPS fix, so it **does not emit** `captured_at_utc`. The Linux host records retrieval time and **UNKNOWN freshness**; even a fresh explicit scan must not be represented as independently time-synchronized sensor evidence. Optional browser survey coordinates refer only to the position of the host, not the access point.
- The `hardware_id` comes from an eFuse-derived stable device identifier and is **device-reported, not authenticated**. No credentials or sensor logs are persisted by this firmware. Scan results are transferred over local USB only.
- On scan failure, firmware emits a bounded `type=error` JSON response with `code=SCAN_FAILED`, not fabricated readings. A missing/invalid board or serial driver yields a host-side error. Do not use this unauthenticated serial interface over a network.

For framing and validation see `../../docs/USB_SERIAL_PROTOCOL.md`.
