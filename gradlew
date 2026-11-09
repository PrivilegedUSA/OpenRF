#!/bin/sh
# OpenRF wrapper launcher: bootstrap the official, checksum-verified Gradle wrapper JAR.
# The checked-in application source contains no downloaded binary executable.
set -eu
APP_HOME=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
JAR="$APP_HOME/.gradle/openrf-bootstrap/gradle-wrapper-8.13.jar"
EXPECTED="81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f"
mkdir -p "$(dirname "$JAR")"
verify() {
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL=$(sha256sum "$1" | cut -d ' ' -f 1)
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL=$(shasum -a 256 "$1" | cut -d ' ' -f 1)
  else
    echo "SHA-256 tool is required." >&2; exit 1
  fi
  [ "$ACTUAL" = "$EXPECTED" ]
}
if [ ! -f "$JAR" ] || ! verify "$JAR"; then
  TMP="$JAR.tmp.$$"
  trap 'rm -f "$TMP"' EXIT INT TERM
  URL="https://services.gradle.org/distributions/gradle-8.13-wrapper.jar"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --retry 3 --silent --show-error "$URL" --output "$TMP"
  elif command -v wget >/dev/null 2>&1; then
    wget --https-only -q "$URL" -O "$TMP"
  else
    echo "Install curl or wget to obtain the official Gradle wrapper JAR." >&2; exit 1
  fi
  verify "$TMP" || { echo "Official wrapper SHA-256 validation failed." >&2; exit 1; }
  mv "$TMP" "$JAR"
  trap - EXIT INT TERM
fi
if [ -n "${JAVA_HOME:-}" ]; then JAVA="$JAVA_HOME/bin/java"; else JAVA="java"; fi
exec "$JAVA" -Dorg.gradle.appname=gradlew -classpath "$JAR" org.gradle.wrapper.GradleWrapperMain "$@"
