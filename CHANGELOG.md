# OpenRF changelog

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
