/*
 * OpenRF v0.2.8 — experimental ESP32-S3 passive 2.4 GHz Wi-Fi sensor
 * Arduino-ESP32 core 3.x; ESP32-S3 target ONLY. No third-party JSON library.
 * Operator-triggered passive scan only; no associations, promiscuous mode,
 * transmissions, BLE, GPS, sub-GHz, or automatic observations.
 *
 * Data are device-reported and uncalibrated. RSSI reflects the receiver's
 * location, NOT access point location or reliable distance.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_system.h>

static constexpr char PROTOCOL[] = "openrf.serial.v1";
static constexpr uint32_t BAUD = 115200;
static constexpr size_t MAX_COMMAND = 80;
static constexpr uint16_t MAX_APS = 32; // bounded well below host's 32 KiB frame cap
static char commandLine[MAX_COMMAND + 1];
static size_t commandLength = 0;
static bool overflowed = false;
static String hardwareId;

static void jsonString(const String& value) {
  Serial.print('"');
  for (size_t i = 0; i < value.length(); ++i) {
    unsigned char c = static_cast<unsigned char>(value[i]);
    if (c == '"' || c == '\\') { Serial.print('\\'); Serial.write(c); }
    else if (c >= 32 && c != 127) Serial.write(c);
    // Omit control characters; SSIDs are not guaranteed to be valid UTF-8.
  }
  Serial.print('"');
}

static void protocolError(const char* code) {
  Serial.print("{\"type\":\"error\",\"protocol\":\"");
  Serial.print(PROTOCOL);
  Serial.print("\",\"code\":");
  jsonString(code);
  Serial.println('}');
}

static void hello() {
  Serial.print("{\"type\":\"hello\",\"protocol\":\"");
  Serial.print(PROTOCOL);
  Serial.print("\",\"hardware_id\":");
  jsonString(hardwareId);
  Serial.print(",\"label\":\"OpenRF ESP32-S3 passive Wi-Fi (experimental)\",\"firmware_version\":\"0.2.8\",\"scan_mode\":\"passive_2g4\",");
  Serial.println("\"capabilities\":[\"WIFI\"]}");
}

static void bssidToString(const uint8_t* bssid, char* dest, size_t cap) {
  snprintf(dest, cap, "%02X:%02X:%02X:%02X:%02X:%02X",
           bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5]);
}

static void snapshot() {
  // Strictly passive scan; no probe requests. All data are measured when
  // commanded, not periodically. ESP32-S3 Wi-Fi is 2.4 GHz only.
  wifi_scan_config_t config = {};
  config.ssid = nullptr;
  config.bssid = nullptr;
  config.channel = 0;
  config.show_hidden = true;
  config.scan_type = WIFI_SCAN_TYPE_PASSIVE;
  config.scan_time.passive = 85; // milliseconds per channel; host has 3-s timeout
  esp_err_t rc = esp_wifi_scan_start(&config, true);
  if (rc != ESP_OK) { protocolError("WIFI_SCAN_FAILED"); return; }
  uint16_t available = 0;
  rc = esp_wifi_scan_get_ap_num(&available);
  if (rc != ESP_OK) { protocolError("WIFI_SCAN_COUNT_FAILED"); return; }
  uint16_t count = available < MAX_APS ? available : MAX_APS;
  wifi_ap_record_t aps[MAX_APS];
  memset(aps, 0, sizeof(aps));
  if (count > 0) {
    rc = esp_wifi_scan_get_ap_records(&count, aps);
    if (rc != ESP_OK) { protocolError("WIFI_SCAN_RESULTS_FAILED"); return; }
  }
  Serial.print("{\"type\":\"snapshot\",\"protocol\":\"");
  Serial.print(PROTOCOL);
  Serial.print("\",\"hardware_id\":");
  jsonString(hardwareId);
  Serial.print(",\"records\":[");
  for (uint16_t i = 0; i < count; ++i) {
    const wifi_ap_record_t& ap = aps[i];
    if (i) Serial.print(',');
    char bssid[18] = {};
    bssidToString(ap.bssid, bssid, sizeof(bssid));
    // Fixed bounded label avoids invalid untrusted SSID bytes in JSON.
    Serial.print("{\"kind\":\"WIFI\",\"identifier\":");
    jsonString(bssid);
    Serial.print(",\"label\":\"ESP32-S3 observed Wi-Fi AP\",\"frequency_mhz\":");
    Serial.print(ap.primary == 14 ? 2484 : 2407 + 5 * ap.primary); // MHz
    Serial.print(",\"rssi_dbm\":");
    Serial.print(static_cast<int>(ap.rssi));
    Serial.print('}');
  }
  Serial.println("]}");
}

void setup() {
  Serial.begin(BAUD);
  // Do not wait for terminal: Linux opens the port on operator request.
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false, false);
  uint64_t chipId = ESP.getEfuseMac();
  char suffix[24] = {};
  snprintf(suffix, sizeof(suffix), "esp32s3-%08lx%04lx",
           static_cast<unsigned long>((chipId >> 16) & 0xffffffffUL),
           static_cast<unsigned long>(chipId & 0xffffUL));
  hardwareId = suffix; // not authenticated; device-reported and stable
}

void loop() {
  while (Serial.available() > 0) {
    char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c == '\n') {
      if (overflowed) protocolError("COMMAND_TOO_LONG");
      else {
        commandLine[commandLength] = '\0';
        if (strcmp(commandLine, "OPENRF HELLO 1") == 0) hello();
        else if (strcmp(commandLine, "OPENRF SNAPSHOT 1") == 0) snapshot();
        else protocolError("UNKNOWN_COMMAND");
      }
      commandLength = 0;
      overflowed = false;
    } else if (!overflowed) {
      if (commandLength >= MAX_COMMAND) overflowed = true;
      else commandLine[commandLength++] = c;
    }
  }
  delay(1);
}
