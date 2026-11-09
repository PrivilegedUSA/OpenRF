# OpenRF v0.1.1 — Android foundation

OpenRF is an experimental, offline-first, general-purpose Android RF investigation and infrastructure documentation platform. This initial release is an **actual Android source project**; it does **not** yet scan RF signals or detect Flock cameras automatically.

## Included

- Dark Kotlin + Jetpack Compose Material 3 interface, five tabs: Map, Scanner, Saved, Sessions, Settings.
- Interactive MapLibre map with online *development-only* style tiles.
- On-demand location permission and a one-shot GPS/network fix; no tracking service.
- Add manual map observations by **long-pressing the map** or **finding your position then tapping the add-location button**.
- Map markers, title/category/notes, observed coordinates, optional GPS accuracy, timestamps, and explicit `MANUAL` / `UNVERIFIED` labels.
- Persistent Room database, search and deletion of manual observations.
- Local CSV export through the system document picker.
- Hardware capability status (no active scanning), basic sensor/alert interfaces.
- GitHub Actions unit-test + debug APK build workflow.

## Install via OpenRF's existing updater

Save `OpenRF-v0.1.1.zip` in the Downloads folder, then from any PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The updater validates the `openrf-bundle.json` manifest, backs up managed files, installs source, commits and pushes to GitHub if `origin` is configured. `-NoPush` disables the push. Installing the ZIP **does not install an APK on your phone**.

After the push, open your GitHub repository → **Actions** → **OpenRF Android Debug APK** → latest successful run → **Artifacts** → `OpenRF-v0.1.1-debug-apk`. Download and unzip the artifact; install the APK on your Android phone. The artifact appears only after the workflow successfully builds.

## Local build

JDK 17 and Android SDK API 36 / Android Build Tools 35.0.0 are required. Run:

```bash
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

On Windows use `gradlew.bat`. **Wrapper note:** Because the bundle generation environment cannot download binary files, this release's launcher bootstraps the official Gradle **8.13 wrapper JAR** on first run into the ignored `.gradle/openrf-bootstrap` folder; it checks the SHA-256 from the Gradle release checksums page. The official Gradle 8.13 distribution ZIP is also SHA-256 pinned via `gradle-wrapper.properties`. Both downloads require internet. The launcher is included in the bundle; no manual Gradle installation is required.

## Test on phone

1. Open Map with an internet connection and confirm geographic tiles display. This uses a demo service, not a production tile SLA.
2. Long-press a road location, create a title/note, and verify that a marker appears.
3. Switch to Saved; check category, coordinates, unverified label, and timestamp.
4. Force-close/reopen the app, confirm the record persists.
5. Tap the locate button, allow location once, and verify it centers on a real reported fix; if denied, verify manual placement still works.
6. Save a second record at the GPS fix and check location accuracy and source labels.
7. Export CSV via Settings and verify saved rows; delete one observation and ensure it disappears from the map.
8. Open Scanner and Sessions: ensure they clearly say no detection/session is active.

## Privacy and limitations

- Manual observations are saved in private app storage with Room and are not automatically uploaded.
- The development map loads `https://demotiles.maplibre.org/style.json` via the network; the map host sees normal tile requests. The map is **not offline-capable** yet. Saved records and CSV export work without map tiles.
- No RF measurements, no Wi-Fi/BLE scanning, no ALPR discovery, no radar detection, no navigation, no alerts, no background location, no photo capture, no synced map data in this version.
- Location is fetched only following an explicit user action. Source is `MANUAL` even if the coordinates came from GPS because the *identification* is human-authored.
- Map marker annotations use MapLibre's legacy marker API initially; migrate to a supported annotation plugin in a later iteration.
- Room schema is version 1; future schema upgrades need explicit migrations. No destructive migration fallback configured.
- Minimum Android version is Android 8.0 (API 26); target SDK 35. Test graphics performance on midrange devices.

## Architecture

The app currently builds as a single Gradle `:app` module for fast validation, but uses boundaries by package: `data`, `location`, `feature/map`, `feature/scanner`, `feature/discoveries`, `feature/investigations`, `feature/settings`, `sensor`, `alerts`, `export`, `ui`. Repository and sensor contracts allow future splitting into feature Gradle modules without a disruptive rewrite.

See `CHANGELOG.md`, `docs/THIRD_PARTY.md`, and `docs/ARCHITECTURE.md`. License for the OpenRF application's original source has not yet been chosen; until a license is added the source should not be represented as formally open-licensed for public redistribution. No proprietary or GPL source was copied into this release.
