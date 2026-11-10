# OpenRF ESP32-S3 firmware — v0.2.8 experimental

**Source-only first firmware; no physical board compilation or measurements have been verified.** This sketch targets an **ESP32-S3 development board with USB serial working** using Arduino-ESP32 **3.x** and its bundled ESP-IDF Wi-Fi libraries. It is not Arduino firmware for generic non-ESP32 or Arduino UNO boards. ESP32-S3 Wi-Fi supports **2.4 GHz only** here (not 5/6 GHz, BLE, sub-GHz, cellular or raw SDR).

## Build and connect

1. Install Arduino IDE and the maintained **esp32 by Espressif Systems** board platform (3.x). Select your specific ESP32-S3 board, serial/USB CDC mode that exposes a serial interface, and correct USB port. Firmware is in `esp32-s3-openrf-serial-v1.ino`. Only flash a board you own/control.
2. Compile and upload from Arduino IDE. Some boards need **USB CDC On Boot** enabled for native USB; others provide a USB-UART bridge. Use a data-capable USB cable. Close the IDE Serial Monitor before probing in OpenRF. **Firmware compilation and upload are untested in this package.**
3. On Raspberry Pi OS/Linux, identify `/dev/ttyACM*` or `/dev/ttyUSB*` in OpenRF Hardware. For WSL2, Windows may require [usbipd-win](https://learn.microsoft.com/windows/wsl/connect-usb) to attach the USB board into WSL; native Windows COM ports are not Linux tty ports.
4. If permission is denied, check the device's Linux group and your groups (`ls -l /dev/ttyACM0`, `id -nG`), add the relevant user to **that** group only if appropriate (often `dialout`), then log out/in. Avoid `chmod 666`, running OpenRF as root, or exposing its unauthenticated API externally.
5. In OpenRF Hardware, click **Refresh inventory**, select the port, **Probe sensor**, then **Capture one snapshot**. Captures are opt-in and saved to the normal local SQLite investigation database. A protocol handshake does not authenticate the board or validate RF measurements.

## Behavior and limits

- USB 115200 8N1 newline protocol `openrf.serial.v1`; responds to `OPENRF HELLO 1` and `OPENRF SNAPSHOT 1` only. Handshake declares **WIFI** alone.
- A snapshot requests **one passive, blocking 2.4 GHz Wi-Fi AP scan** through ESP-IDF. There are no intentional probe requests, associations or AP connections. Radio mode initialization and local RF regulatory behavior still depend on firmware/board configuration. Do not assume it is a calibrated or certified instrument.
- Snapshot includes up to **32** AP records: BSSID identifier, Wi-Fi category, MHz and ESP32-reported dBm RSSI. BSSID is an identifier, not user identity. The firmware omits SSID to minimize unnecessary identifying data and avoid invalid UTF-8 from arbitrary SSIDs.
- No GNSS/time sync is present. `captured_at_utc` is **omitted**, and OpenRF correctly labels the timestamp `HOST_RETRIEVAL_ONLY` / unknown freshness. Retrieval time does not prove actual beacon time. Signal power is uncalibrated. Observer location, if attached, is the **browser's** location, not the transmitter's.
- Firmware reports errors as protocol `type:error` frames, not fake empty survey results. A legitimate zero-result survey uses `records:[]`. The host rejects error frames without saving a capture.
- Never label a Wi-Fi AP as an ALPR camera, Flock camera, or person's position from these readings. Passive AP discovery cannot establish either.
- Up to 32 APs are returned, not a comprehensive spectrum/capture. It does not sniff frames, transmit commands over RF, jam, replay remotes, or report unsupported measurements.
- Some ESP32-S3 native USB ports restart or take longer to initialize when a serial connection opens; if the 3-second HELLO deadline expires, ensure USB CDC settings, firmware startup and cable support match the board and retry.

**License:** firmware offered under the project's eventual selected open-source license. Choose and include an explicit SPDX-compatible repository license before distributing publicly. Espressif Arduino-ESP32/ESP-IDF components have their own notices; see upstream licenses. No external firmware library source is vendored here.
