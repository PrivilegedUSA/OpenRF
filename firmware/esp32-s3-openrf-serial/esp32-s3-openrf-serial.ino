// OpenRF 0.2.8 — ESP32-S3 USB Serial v1, on-demand PASSIVE Wi-Fi survey.
// Requires Espressif Arduino-ESP32 core 3.x, ESP32-S3 target, USB CDC On Boot.
// No BLE, SDR, RF transmitter, GNSS or continuous acquisition is implemented.
// This firmware contains no demo/sample RF readings. Do not deploy on an
// internet-accessible serial bridge: the protocol has no authentication.
#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>

#ifndef CONFIG_IDF_TARGET_ESP32S3
#error "Select an ESP32-S3 board in the Arduino IDE"
#endif

static constexpr size_t MAX_COMMAND = 48;
static constexpr uint16_t MAX_APS = 64;  // host accepts up to 128
static constexpr uint32_t PASSIVE_DWELL_MS = 120;
static char commandBuffer[MAX_COMMAND + 1];
static size_t commandLength = 0;
static bool overflow = false;
static char hardwareId[24];

static void jsonAscii(const char* data, size_t limit) {
  // ASCII safe output: radio SSIDs can contain arbitrary bytes, including
  // malformed UTF-8; replace non-printable or non-ASCII bytes with '?'.
  Serial.write('"');
  for (size_t i = 0; i < limit && data[i] != 0; ++i) {
    unsigned char c = static_cast<unsigned char>(data[i]);
    if (c == '"' || c == '\\') Serial.write('\\');
    if (c >= 32 && c <= 126) Serial.write(c);
    else Serial.write('?');
  }
  Serial.write('"');
}

static void emitError(const char* code, const char* message) {
  Serial.print("{\"type\":\"error\",\"protocol\":\"openrf.serial.v1\",\"hardware_id\":");
  jsonAscii(hardwareId, sizeof(hardwareId));
  Serial.print(",\"code\":");
  jsonAscii(code, 40);
  Serial.print(",\"message\":");
  jsonAscii(message, 120);
  Serial.println('}');
  Serial.flush();
}

static void emitHello() {
  Serial.print("{\"type\":\"hello\",\"protocol\":\"openrf.serial.v1\",\"hardware_id\":");
  jsonAscii(hardwareId, sizeof(hardwareId));
  Serial.println(",\"label\":\"OpenRF ESP32-S3 passive Wi-Fi sensor\",\"capabilities\":[\"WIFI\"],\"firmware_version\":\"0.2.8\",\"scan_mode\":\"PASSIVE_WIFI\"}");
  Serial.flush();
}

static int frequencyMHz(uint8_t channel) {
  // ESP32-S3 is 2.4 GHz Wi-Fi-only. Never claim 5/6 GHz capability.
  if (channel >= 1 && channel <= 13) return 2407 + 5 * channel;
  if (channel == 14) return 2484;
  return 0;
}

static void emitSnapshot() {
  wifi_scan_config_t config = {};
  config.show_hidden = true;
  config.scan_type = WIFI_SCAN_TYPE_PASSIVE;
  config.scan_time.passive = PASSIVE_DWELL_MS;
  // A blocking esp_wifi_scan_start waits for this explicitly requested scan.
  esp_err_t result = esp_wifi_scan_start(&config, true);
  if (result != ESP_OK) {
    emitError("SCAN_FAILED", "Passive Wi-Fi scan failed; check Wi-Fi driver state");
    return;
  }
  uint16_t available = 0;
  if (esp_wifi_scan_get_ap_num(&available) != ESP_OK) {
    esp_wifi_clear_ap_list();
    emitError("SCAN_FAILED", "Wi-Fi result count unavailable");
    return;
  }
  uint16_t count = available < MAX_APS ? available : MAX_APS;
  wifi_ap_record_t* accessPoints = count ? static_cast<wifi_ap_record_t*>(calloc(count, sizeof(wifi_ap_record_t))) : nullptr;
  if (count && !accessPoints) {
    esp_wifi_clear_ap_list();
    emitError("OUT_OF_MEMORY", "Unable to allocate Wi-Fi scan result buffer");
    return;
  }
  // Taking scan results frees IDF-owned scan memory; no background caching.
  if (count && esp_wifi_scan_get_ap_records(&count, accessPoints) != ESP_OK) {
    free(accessPoints);
    esp_wifi_clear_ap_list();
    emitError("SCAN_FAILED", "Unable to fetch Wi-Fi scan records");
    return;
  }
  if (!count) esp_wifi_clear_ap_list();

  Serial.print("{\"type\":\"snapshot\",\"protocol\":\"openrf.serial.v1\",\"hardware_id\":");
  jsonAscii(hardwareId, sizeof(hardwareId));
  // No RTC/GNSS fix is available. Deliberately omit captured_at_utc;
  // the host will label time as HOST_RETRIEVAL_ONLY, not live GPS time.
  Serial.print(",\"records\":[");
  bool emitted = false;
  for (uint16_t i = 0; i < count; ++i) {
    const wifi_ap_record_t& ap = accessPoints[i];
    const int mhz = frequencyMHz(ap.primary);
    if (!mhz) continue;
    if (emitted) Serial.print(',');
    emitted = true;
    char bssid[18];
    snprintf(bssid, sizeof(bssid), "%02X:%02X:%02X:%02X:%02X:%02X",
             ap.bssid[0], ap.bssid[1], ap.bssid[2], ap.bssid[3], ap.bssid[4], ap.bssid[5]);
    Serial.print("{\"kind\":\"WIFI\",\"identifier\":");
    jsonAscii(bssid, sizeof(bssid));
    Serial.print(",\"label\":");
    if (ap.ssid[0] == 0) jsonAscii("Wi-Fi AP (hidden SSID)", 32);
    else jsonAscii(reinterpret_cast<const char*>(ap.ssid), 32);
    Serial.print(",\"frequency_mhz\":");
    Serial.print(mhz);
    Serial.print(",\"rssi_dbm\":");
    Serial.print(static_cast<int>(ap.rssi));
    Serial.print('}');
  }
  Serial.println("]}");
  Serial.flush();
  free(accessPoints);
}

static void handleCommand(const char* command) {
  if (strcmp(command, "OPENRF HELLO 1") == 0) emitHello();
  else if (strcmp(command, "OPENRF SNAPSHOT 1") == 0) emitSnapshot();
  else emitError("UNKNOWN_COMMAND", "Supported commands: OPENRF HELLO 1, OPENRF SNAPSHOT 1");
}

void setup() {
  Serial.begin(115200);
  const uint64_t chip = ESP.getEfuseMac();
  snprintf(hardwareId, sizeof(hardwareId), "esp32s3-%012llX", static_cast<unsigned long long>(chip));
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false, false);
}

void loop() {
  while (Serial.available() > 0) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\n') {
      if (overflow) emitError("COMMAND_TOO_LONG", "USB command exceeds limit");
      else { commandBuffer[commandLength] = 0; handleCommand(commandBuffer); }
      commandLength = 0;
      overflow = false;
    } else if (c != '\r') {
      if (commandLength < MAX_COMMAND) commandBuffer[commandLength++] = c;
      else overflow = true;
    }
  }
  delay(2);
}
