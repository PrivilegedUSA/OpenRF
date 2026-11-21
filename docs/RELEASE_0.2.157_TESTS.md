# OpenRF v0.2.157 — Linux `.deb` and Raspberry Pi startup verification

Date: 2026-11-20

## Delivered source changes

- `tools/openrf-electron/package.json`: pinned Electron/electron-builder and generated Debian metadata; explicit GUI library and Python 3.11+ dependencies; packaged backend and `pi-startup.py` resources.
- `tools/openrf-electron/package-lock.json`: reproducible dependency resolution for `npm ci`.
- `tools/openrf-electron/main.js`: explicit `--openrf-kiosk` launch option in addition to `OPENRF_KIOSK=1`.
- `tools/openrf-electron/pi-startup.py`: opt-in `enable`, `disable`, `status` for the signed-in labwc user. Preserves other startup entries and refuses corrupted markers or symlink files. No automatic package-install startup, root login or background service.
- `tests/test_pi_startup_v157.py`, `tests/test_electron_deb_v157.js`: new tests for stanza safety, idempotence, package resources and configuration.
- `README.md`, `CHANGELOG.md`, `docs/NATIVE_BROWSER_PI.md`: user installation/build/startup guidance and known limitations.
- `openrf-bundle.json`, application/server version and existing version assertions updated to 0.2.157.

## Completed verification

| Check | Result |
| --- | --- |
| Python: `python3 -m unittest discover -s tests -p 'test_*.py' -q` | **432 tests, passed** |
| JavaScript: each `node tests/*.js` suite | **127 suites, passed** |
| Electron x64 Debian package: `npm run build:deb:x64` | **Built**, `OpenRF-0.2.157-amd64.deb` (~121 MiB) |
| Electron ARM64 Debian package: `npm run build:deb:arm64` | **Built**, `OpenRF-0.2.157-arm64.deb` (~116 MiB) |
| `dpkg-deb -f` metadata inspection | Both report `Package: openrf`, `Version: 0.2.157`, corresponding `amd64` / `arm64` and explicit Linux GUI/Python dependencies |
| `dpkg-deb -c` archive content inspection | Both contain `/opt/OpenRF/openrf`, `/opt/OpenRF/resources/project/openrf/__main__.py`, `/opt/OpenRF/resources/pi-startup.py`, and `/usr/share/applications/org.openrf.fieldconsole.desktop` |

The earlier build's invalid literal `Depends: default` was corrected to electron-builder's actual default Debian GUI dependencies **plus** the Python and ALSA dependency; the final two packages use the corrected metadata.

## Not verified here

- No package was **installed** with `apt` on the user's machine, a real Raspberry Pi OS image, or a physical Pi. Package build and archive inspection do not prove interactive window launch, uninstall/reinstall/upgrade behavior, working fullscreen labwc startup, touch display, GPS, Wi-Fi chipset, RTL-SDR, RF receiver, 1280×800 field legibility or power draw.
- The release did not modify the user's real labwc autostart file; tests used temporary directories. Pi desktop autologin is intentionally a separate operator choice.
- The software remains local-first; no new hardware reading or live route result is claimed. Electron may need graphics configuration on WSLg / Pi, and isolated Chromium browser remains memory-intensive.
- For public distribution, decide an open-source project license and replace local-only maintainer contact `openrf@localhost` and the provisional GitHub topic homepage with real project metadata. This patch's output is for local testing.

## Recommended hardware checks

1. On 64-bit Raspberry Pi OS Desktop, install the ARM64 `.deb` with `sudo apt install ./OpenRF-0.2.157-arm64.deb`; confirm the launcher appears in the desktop menu and `openrf` starts its own local Python backend.
2. Check that the map loads, source switching and panning work, embedded Browser tabs stay loaded, and App Settings displays real memory metrics. Test with and without Wi-Fi and external GNSS hardware. These checks need hardware and consent.
3. Run `python3 /opt/OpenRF/resources/pi-startup.py enable` **as the desktop user**. Confirm only the marked block was added to `~/.config/labwc/autostart`; log out/in and verify fullscreen startup. Run `disable` and verify normal desktop startup returns.
4. Use 1280×800 at full-screen, note RAM/CPU/temperature usage, try navigation without live GPS, verify that unsupported functions report as unsupported, and test an app update/removal.

## Next suggested patch

Real Raspberry Pi install/first-boot validation, then a dedicated device setup page for autostart status, safe exit from kiosk, battery/screen power management, and ARM64 display/GPU compatibility checks. Avoid extending background networking or hardware claims until actual devices are connected.
