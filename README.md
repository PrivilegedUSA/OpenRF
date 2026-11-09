# OpenRF v0.1.4 — Automatic GPS centering and detailed map

OpenRF is an experimental, offline-first, general-purpose Android RF investigation and infrastructure documentation platform. This is a working Android source project, **not yet** an RF scanner or an automated ALPR/camera detector.

## Included

- Native Kotlin + Jetpack Compose Material 3 dark UI; Map, Scanner, Saved, Sessions, Settings.
- MapLibre interactive map using OpenFreeMap street-level **Liberty** style by default; optional **Dark** style via Layers button. City and road labels appear as you zoom in. No API key.
- When Map opens with location permission, requests a single foreground location fix and automatically centers on it; prompts once on first launch if permission is not granted. If declined, manual map use still works, and the location button can ask again.
- After the user switches tabs and reenters Map, the map requests a fresh location fix if permission remains granted. The location marker represents the **last one-shot fix**, not continuous live tracking.
- Long-press a location or tap add-location after an actual GPS/network fix to save manual observations, with notes/category, timestamp and optional accuracy.
- Persistent Room records, observation search/delete, local CSV export via Android file picker.
- Scanner/Sessions are inactive and clearly described; no fake detections or background monitoring.
- GitHub Actions Kotlin tests + debug APK build.

## Install the bundle

Save `OpenRF-v0.1.4.zip` to your Windows Downloads folder and run from any PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The updater installs source into `C:\projects\OpenRF`, commits managed files and pushes to GitHub by default. It does not install the APK on your phone. Once the pushed GitHub Actions run succeeds, use Actions → OpenRF Android Debug APK → Artifacts → `OpenRF-v0.1.4-debug-apk`, unzip and install the APK. Local records should remain intact when upgrading with the same Android application ID; the database schema is unchanged.

## Phone test steps

1. Open Map with internet access, allow location when Android prompts, and verify the map zooms to your real position automatically. There may be a delay while a fresh fix is obtained.
2. Confirm **streets, road labels, city names** render when zoomed to neighborhood/city level. This now uses an OpenFreeMap street map, not MapLibre's intentionally sparse test tiles.
3. Tap Layers (upper-right), select Dark, verify the map theme changes **without resetting your camera** or losing the locally saved pins. Switch back to Streets.
4. Tap the center-on-location button to refresh your one-time position. Deny the request on a second device to ensure the map remains usable and doesn't repeatedly ask on every visit.
5. Long-press a place, save a manual observation; verify it appears in Saved, survives force-closing the app, and can be exported to CSV from Settings.
6. Test on Wi-Fi and cellular data. With data disabled, previously cached tiles may appear, but **offline maps/downloads are not implemented**.
7. Open Scanner and Sessions and confirm neither falsely claims live RF scanning.

## Limitations and privacy

- **Internet is required for new map tiles.** OpenFreeMap's public tiles are not an offline service. The provider receives ordinary network tile/style requests for viewed areas, but observations are not uploaded by OpenRF.
- Provider-hosted offline downloads have limits (currently 3,000 tiles or 50 MB per download, with no more than 4 concurrent requests; follow their terms). This release implements **no offline downloading**. Future larger offline maps need separately licensed datasets or self-hosting.
- GPS is on demand when Map is entered or the center button is pressed; it does not run after leaving the map and does not record trips.
- The marker for your location is the latest one-shot fix; **not** a continuous tracking dot. Nearby cell/Wi-Fi/BLE signals are not being measured.
- No active scanner, proximity alerts, investigation sessions, directions, automatic camera classification or Flock detection yet.
- All observations remain `MANUAL` and `UNVERIFIED`, even when their coordinates are from Android's location API.
- No API key or user account required. The OpenRF application's own source license remains to be selected before public distribution.

## Build

GitHub Actions sets up JDK 17, Android SDK 36 and Gradle 8.13, runs `:app:testDebugUnitTest :app:assembleDebug` and uploads the artifact if successful. Local Gradle launchers are also provided. Build success for **this exact release** is not guaranteed until the workflow completes.

See `CHANGELOG.md`, `docs/ARCHITECTURE.md` and `docs/THIRD_PARTY.md` for implementation and license notes.
