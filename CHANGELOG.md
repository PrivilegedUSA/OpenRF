# OpenRF changelog

## v0.1.1 — 2026-11-09

**GitHub Actions SDK setup hotfix.** Switched `android-actions/setup-android` from v3 to v4, explicitly requesting only `platform-tools` to avoid the discontinued `tools` SDK package. Suppressed the large SDK license text in CI logs. Updated the APK artifact name, Android versionCode/versionName, and visible version label. No scanner, mapping, data model, permissions, export or UI behavior changes beyond the version label.

**Why:** v0.1.0 GitHub Actions failed while running `sdkmanager tools` (Google no longer serves that package), before Android compilation.

**Validation:** ZIP structure and file continuity checked locally; no Android SDK available here, so GitHub Actions must confirm that the full build and unit tests succeed.


## v0.1.0 — 2026-11-09

Initial Android source release. Kotlin / Jetpack Compose dark UI, MapLibre map, explicit one-time location lookup, Room-backed user-authored field observations, map markers, local CSV export, safe empty states for RF scanning/sessions, JVM tests and GitHub Actions build workflow. No actual RF scanning or automated camera classification.

Build status: **not yet verified** in this environment (Android SDK and remote dependencies unavailable). GitHub Actions is the first integration build. Do not assume the APK exists until its job succeeds.
