/*
 * OpenRF Weather Serial v1 — OPTIONAL ESP32-S3 + BME280 USB bridge example.
 * Source-only, NOT compiled on physical hardware in this release.
 * ESP32-S3 with USB CDC or USB-UART at 115200, Arduino ESP32 core 3.x.
 * Requires Adafruit BME280 Library (+ Adafruit Unified Sensor dependencies).
 * Does not transmit RF, use Wi-Fi, claim sensor verification, or auto-log.
 *
 * Wiring: BME280 VCC=3.3V, GND=GND, SDA=GPIO8, SCL=GPIO9 by default.
 * CHANGE PINS to match your board. Do not connect a 5V-only sensor directly.
 */
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_BME280.h>
#include <math.h>

static constexpr uint32_t BAUD = 115200;
static constexpr int WEATHER_SDA_PIN = 8;
static constexpr int WEATHER_SCL_PIN = 9;
static constexpr size_t MAX_COMMAND = 80;
static constexpr char PROTOCOL[] = "openrf.weather.serial.v1";
static Adafruit_BME280 bme;
static bool sensorReady = false;
static uint8_t sensorAddress = 0;
static char commandLine[MAX_COMMAND + 1];
static size_t commandLength = 0;
static bool overflowed = false;
static String hardwareId;

static void jsonText(const String& text) {
  Serial.write('"');
  for (size_t i=0;i<text.length();i++) {
    const char c=text[i];
    if (c=='"'||c=='\\') { Serial.write('\\'); Serial.write(c); }
    else if (static_cast<unsigned char>(c)>=32 && c!=127) Serial.write(c);
  }
  Serial.write('"');
}

static void replyError(const char* code) {
  Serial.print("{\"protocol\":\"");Serial.print(PROTOCOL);
  Serial.print("\",\"type\":\"error\",\"code\":");jsonText(code);Serial.println('}');
}

static void replyHello() {
  Serial.print("{\"protocol\":\"");Serial.print(PROTOCOL);
  Serial.print("\",\"type\":\"hello\",\"hardware_id\":");jsonText(hardwareId);
  Serial.print(",\"label\":\"ESP32-S3 BME280 weather example (unverified)\",\"firmware_version\":\"0.2.172-experimental\",\"capabilities\":[\"WEATHER\"]}");
  Serial.println();
}

static void replySnapshot() {
  if (!sensorReady) { replyError("SENSOR_NOT_AVAILABLE"); return; }
  // Read ONLY after host command. Sensor is not logged or streamed at idle.
  const float tempC=bme.readTemperature();
  const float humidity=bme.readHumidity();
  const float pressureHpa=bme.readPressure()/100.0f;
  if (!isfinite(tempC)||!isfinite(humidity)||!isfinite(pressureHpa)) {
    replyError("INVALID_BME280_READING");return;
  }
  Serial.print("{\"protocol\":\"");Serial.print(PROTOCOL);
  Serial.print("\",\"type\":\"snapshot\",\"hardware_id\":");jsonText(hardwareId);
  Serial.print(",\"sensors\":[{\"sensor_id\":");
  jsonText(sensorAddress==0x76?"bme280-i2c-0x76":"bme280-i2c-0x77");
  Serial.print(",\"model\":\"Bosch BME280 via ESP32-S3\",\"channel\":\"i2c\",\"measurement_age_seconds\":0,\"measurements\":{");
  Serial.print("\"temperature_c\":");Serial.print(tempC,3);
  Serial.print(",\"humidity_pct\":");Serial.print(humidity,3);
  Serial.print(",\"pressure_hpa\":");Serial.print(pressureHpa,3);
  Serial.println("}}]}");
}

void setup(){
  Serial.begin(BAUD);
  Wire.begin(WEATHER_SDA_PIN,WEATHER_SCL_PIN);
  sensorReady=bme.begin(0x76);
  if(sensorReady) sensorAddress=0x76;
  else {sensorReady=bme.begin(0x77);if(sensorReady)sensorAddress=0x77;}
  const uint64_t chipId=ESP.getEfuseMac();
  char suffix[30];
  snprintf(suffix,sizeof(suffix),"esp32s3-%08lx%04lx",
           static_cast<unsigned long>((chipId>>16)&0xffffffffUL),
           static_cast<unsigned long>(chipId&0xffffUL));
  hardwareId=suffix;  // DEVICE-REPORTED only; not authenticated.
}

void loop(){
  while(Serial.available()>0){
    const char c=static_cast<char>(Serial.read());
    if(c=='\r')continue;
    if(c=='\n'){
      if(overflowed) replyError("COMMAND_TOO_LONG");
      else {
        commandLine[commandLength]='\0';
        if(strcmp(commandLine,"OPENRF WEATHER HELLO 1")==0)replyHello();
        else if(strcmp(commandLine,"OPENRF WEATHER SNAPSHOT 1")==0)replySnapshot();
        else replyError("UNKNOWN_COMMAND");
      }
      commandLength=0;overflowed=false;
    }else if(!overflowed){
      if(commandLength>=MAX_COMMAND)overflowed=true;
      else commandLine[commandLength++]=c;
    }
  }
  delay(1);
}
