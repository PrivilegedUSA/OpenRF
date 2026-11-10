# OpenRF Changelog

## 0.1.6 — Foreground investigation sessions (2026-11-09)

- Added a named, explicit Start / Stop investigation workflow and local session history.
- New `investigation_sessions`, `session_scans` and `session_readings` Room tables, with non-destructive v1→v2 migration. Existing saved observation table is untouched.
- Each completed BLE/Wi-Fi scan during an active session is stored automatically, including successful scans with zero readings, preserving repeated measurements across scan cycles.
- Optional one-shot receiver phone fix per completed scan; absent locations stay null, and phone coordinates do not represent transmitter locations.
- Added per-session review, snapshot statistics, detailed readings, user-directed CSV export and confirmed deletion. CSV escapes spreadsheet formula prefixes in untrusted wireless labels.
- Sessions end on app background and are recovered as interrupted after unexpected process death; no background scanning or travel recording.
- Added SessionCsvExporter JVM unit tests and documentation of migration/phone tests. Scanner/map/manual observations retained.
- No full APK build or device upgrade test was available in the packaging environment; verify via GitHub Actions and an in-place phone upgrade.

# OpenRF changelog

## v0.1.5 — 2026-11-09

- Added real, user-started **Bluetooth LE advertisement scans** with hardware/permission checks, 12-second timeout, stop button, RSSI, timestamps, deduplication and explicit scan errors.
- Added real **Wi-Fi AP discovery** using Android `WifiManager.startScan` and scan-completion broadcast. Filters failed/cached result sets and timestamp-stale access points; surfaces platform throttling and missing Location services.
- Added optional, user-initiated **Save survey point** for observed BLE/Wi-Fi readings using a recent foreground phone location. Preserved the Room v1 database schema, with `source=BLE_SCAN` or `WIFI_SCAN` and `verification=UNIDENTIFIED`. Saved coordinates denote the phone receiver, not transmitter location.
- Updated Discoveries, Map marker descriptions, and Settings to distinguish manual notes from RF observations, retain provenance and avoid unsupported classifications. Added four pure JVM tests for Wi-Fi freshness and monotonic-to-wall-clock time conversion.
- Kept MapLibre GPS/maps, existing manual records, CSV export and GitHub workflow. No session recording or external hardware detection.

**Verification:** Full source and manifest packaging validated; targeted Kotlin tests are run locally when available. GitHub Actions and device checks remain necessary to confirm Android compilation and platform scan behavior.

## v0.1.4 — 2026-11-09

**First phone-feedback iteration.** The user confirmed v0.1.3 installs and starts on Android. Replaced MapLibre's minimal demonstration style with public OpenFreeMap Liberty street map (with road and place labels), added optional OpenFreeMap Dark map selection, and saved the selection locally. Map automatically requests a one-shot foreground location fix on entry when permitted; first opening prompts once for Android location permission, with manual fallback if denied. The on-demand fix now tries both allowed network and GPS providers, using the first valid reading, including when only approximate location is granted. Preserved manual observation creation, source/verification labels, Room schema v1, local CSV export and existing five tabs. Added visible OpenStreetMap/OpenFreeMap map attribution and refreshed privacy explanations.

**Verification:** Whole ZIP/manifest/continuity and static project checks performed, plus JVM-only checks of the style catalog and location overload stubs. No Android SDK in the packaging environment, so the full Android build and user-visible rendering are **not yet verified** for v0.1.4. Integration verification is the GitHub Actions build; the map and permission behavior require a phone test.

## v0.1.3 — 2026-11-09

**Kotlin location compilation hotfix.** The v0.1.2 GitHub Actions run successfully initialized Android SDK/Gradle and reached `:app:compileDebugKotlin`, which failed on an overloaded `LocationManagerCompat.getCurrentLocation` call in `PhoneLocationSource.kt`. The `null` cancellation-signal argument could match both the Android platform and AndroidX compatibility overloads. The location code now passes an explicitly typed `android.os.CancellationSignal?` and an explicitly typed `androidx.core.util.Consumer<Location>` callback. No change to the on-demand location semantics, app permissions, database, scanners or UI apart from the version label. APK artifact version updated to v0.1.3.

**Verification:** Package structure and release continuity are verified. The location source was compiled against minimal Java stubs modeling both AndroidX overloads using local Kotlin compiler. The full Android/Gradle build and phone runtime are not verified here; GitHub Actions remains the integration test.

## v0.1.2 — 2026-11-09

**Gradle startup hotfix.** The v0.1.1 GitHub Actions run advanced past Android SDK setup but failed before compilation: the custom `gradlew` launcher requested `https://services.gradle.org/distributions/gradle-8.13-wrapper.jar`, which returned HTTP 404. GitHub Actions now provisions Gradle 8.13 via `gradle/actions/setup-gradle@v4` and executes it directly. Both local launchers now fetch the wrapper JAR from Gradle's official GitHub `v8.13.0` tag, retaining the published SHA-256 verification. Gradle distribution SHA-256 pin is unchanged. Updated app version and artifact name to 0.1.2.

All other application source and data schema are unchanged from v0.1.1. Existing Room observations remain compatible. This release has **not** yet passed a full Android SDK build. The next GitHub Actions run is the integration test.

## v0.1.1 — 2026-11-09

**GitHub Actions SDK setup hotfix.** Switched `android-actions/setup-android` from v3 to v4, explicitly requesting only `platform-tools` to avoid the discontinued `tools` SDK package. Suppressed the large SDK license text in CI logs. Updated the APK artifact name, Android versionCode/versionName, and visible version label. No scanner, mapping, data model, permissions, export or UI behavior changes beyond the version label.

**Why:** v0.1.0 GitHub Actions failed while running `sdkmanager tools` (Google no longer serves that package), before Android compilation.

**Validation:** ZIP structure and file continuity checked locally; no Android SDK available here, so GitHub Actions must confirm that the full build and unit tests succeed.


## v0.1.0 — 2026-11-09

Initial Android source release. Kotlin / Jetpack Compose dark UI, MapLibre map, explicit one-time location lookup, Room-backed user-authored field observations, map markers, local CSV export, safe empty states for RF scanning/sessions, JVM tests and GitHub Actions build workflow. No actual RF scanning or automated camera classification.

Build status: **not yet verified** in this environment (Android SDK and remote dependencies unavailable). GitHub Actions is the first integration build. Do not assume the APK exists until its job succeeds.
