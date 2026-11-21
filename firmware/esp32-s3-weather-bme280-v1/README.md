# Optional ESP32-S3 / BME280 USB weather example — OpenRF v0.2.172

This is **experimental source only**. No firmware compilation, real board, physical wiring, measured sensor accuracy or USB passthrough has been verified. It deliberately supports **only a BME280 temperature/humidity/pressure sensor**. It does **not** claim to measure wind, rainfall, UV, GNSS or other sensor types. Those fields can be added by adapting firmware to *actual* external sensor hardware and its documented driver.

## Hardware and setup

1. ESP32-S3 development board with a Linux-visible USB CDC/USB-UART port, a 3.3 V-compatible genuine BME280 I2C breakout, data-capable USB cable, and correct power/ground. Change pin constants if your board uses a different pin map. This example uses **GPIO8 for SDA**, **GPIO9 for SCL**, **3.3 V** and **GND**, but not every ESP32-S3 board exposes or supports these pins the same way. Never put 5 V logic on an ESP32 pin.
2. In Arduino IDE, install **esp32 by Espressif Systems (3.x)** and **Adafruit BME280 Library** (and the Adafruit dependencies offered by Library Manager). Select the exact board and USB CDC setting. Build and upload the `.ino` sketch. Compilation/upload/hardware behavior remain *untested* in this source package.
3. Disconnect Arduino Serial Monitor before using OpenRF. On Linux or Raspberry Pi OS, the board may be `/dev/ttyACM0` or `/dev/ttyUSB0`. WSL may require Windows `usbipd` USB passthrough. `id -nG` and `ls -l /dev/ttyACM0` can help explain permission errors; do not run the OpenRF web server as root or make the serial node world-writable.
4. In **Weather Station → Stations & Sensors → Wired weather sensors**, select **Refresh USB ports**. Pick the candidate port, tap **Probe selected bridge** to verify the *protocol response*, then **Read one snapshot**. This command reads the BME280 once. The data is not saved until you explicitly select the sensor and tap **Save this reading** under a local weather station.

## Protocol contract

USB serial **115200 8N1**, one newline-terminated JSON object per command, no periodic status messages. Other USB products are not compatible without implementing the specified protocol.

- Host sends `OPENRF WEATHER HELLO 1\n` → firmware returns a JSON object with `protocol: "openrf.weather.serial.v1"`, `type: "hello"`, `hardware_id`, `label`, `firmware_version`, `capabilities: ["WEATHER"]`.
- Host sends `OPENRF WEATHER SNAPSHOT 1\n` → firmware returns `type: "snapshot"`, the same `hardware_id`, and `sensors` array containing `sensor_id`, `model`, optional `channel`, SI `measurements` (field names include units), and optional `reported_at_utc` / `measurement_age_seconds`.
- A bridge without working sensors replies `type: "error"` and a code; the host rejects it rather than faking zeros. Maximum 16 sensors, 32 KiB response, three-second operation timeout. No unsolicited device scanning, RF transmission or automatic history writes.

This example has **no RTC** and does not invent a device-origin UTC timestamp. It reports a zero-second *firmware-reported* age for the measurements it reads in direct response to the host command. OpenRF records the **host UTC reception time** and labels freshness and identity unverified. It marks readings as stale when a device-reported timestamp/age exceeds 120 seconds; an unknown device age stays unknown. Other bridges must provide real age information or omit it, never pretend stale or historical measurements were just acquired.

## Upstream and licensing

- [Adafruit BME280 library](https://github.com/adafruit/Adafruit_BME280_Library) provides `begin`, `readTemperature`, `readHumidity`, and `readPressure` APIs. Install it separately through Arduino Library Manager; third-party code is not vendored in the ZIP.
- The firmware source is part of OpenRF's GPL-3.0-or-later project. Independently installed Arduino-ESP32 and Adafruit libraries have their own upstream license notices.
