# OpenRF v0.2.177 — Linux Debian package preparation and validation

This release remains a **complete source updater ZIP**. Install it using the existing Windows PowerShell updater, with `openrf-bundle.json` at ZIP root and managed source under `project/`; the updated package builder, tests and docs go into the managed `project/tools`, `project/tests`, and `project/docs` directories. The `.deb` binaries are distinct build outputs and must not be placed inside the source update ZIP.

## Included changes

1. The `tools/Build-OpenRF-Deb.ps1` wrapper resolves the project directory relative to itself, maps it to WSL using `wslpath`, and runs `tools/build-openrf-deb.sh both` by default. Choose `-Architecture amd64` or `-Architecture arm64` to limit it to one target. No Git commit, push, package install or system service is performed.
2. `tools/build-openrf-deb.sh` first compares the Python, Electron backend, npm manifest and lockfile versions and GPL metadata. Then it runs the existing local test launcher, uses locked npm dependencies, builds the requested `.deb` target(s), and runs `tools/verify_openrf_deb.py` against each artifact before printing its SHA-256.
3. Packaging metadata uses GPL-3.0-or-later, the actual GitHub repository, and the public maintainer name PrivilegedUSA. The `.deb` includes project LICENSE/COPYRIGHT. We have not invented a personal support email address. Debian dependencies accept both the original and `t64` GTK, accessibility and ALSA library package names used across older/newer Debian and Ubuntu versions.
4. `tools/build_release_zip.py` excludes locally generated Electron folders (`node_modules`, `node_modules.windows-backup`, `dist`, `release`) so running the `.deb` builder cannot accidentally inflate or pollute subsequent updater ZIPs. All original restricted paths still fail validation.
5. All Weather Hub behavior and data/backup boundaries from v0.2.176 are preserved. The optional Electron shell only starts its own backend on loopback. No automatic Pi kiosk startup or Internet exposure is enabled.

## Local build commands (no GitHub Actions used)

After updating OpenRF v0.2.177, from **any Windows PowerShell directory**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\tools\Build-OpenRF-Deb.ps1'
```

Or from Ubuntu/WSL:

```bash
cd /mnt/c/projects/OpenRF && bash tools/build-openrf-deb.sh both
```

Pre-requisites in WSL: `python3` (3.11+), `node` (20+), `npm`, `dpkg-deb`, and network access for the pinned Electron/npm dependencies if not cached. The local test script also requires installed Node.js. The script runs `npm ci`, which recreates the Electron-only `tools/openrf-electron/node_modules`; it never overwrites tracked OpenRF application data. Built files appear in `tools/openrf-electron/dist/`:

- `OpenRF-0.2.177-amd64.deb` for 64-bit x86 Ubuntu/Debian Linux.
- `OpenRF-0.2.177-arm64.deb` for 64-bit ARM Debian/Raspberry Pi OS.

SHA-256 of the two packages produced in the Linux container for this release (rebuilding locally may produce different binary checksums):

```
4e3ce70906ef9937a3d51ade1ea8abf2f3062e65e5bac0e8f9f468ab127abef1  OpenRF-0.2.177-amd64.deb
9df336af6b79d02d07812f70f70b5b7a3f47f4f8147233315ee7923f227f9c6e  OpenRF-0.2.177-arm64.deb
```

The verifier checks `dpkg-deb` metadata for package name, version, architecture, Python and Chromium dependencies, homepage and maintainer. It requires the Linux launcher, server source, static interface, optional Pi startup helper and GPL LICENSE/COPYRIGHT inside the archive. Package builds are separate from the OpenRF source ZIP; package inspection is **not** installation or launch testing.

## Installation/manual acceptance after a successful package build

On a compatible **test** Linux desktop, after reviewing/obtaining the matching `.deb`:

```bash
sudo apt install ./OpenRF-0.2.177-amd64.deb
openrf
```

On real 64-bit Raspberry Pi OS with a desktop, use the matching ARM64 `.deb` and repeat. Verify the menu icon, start/stop ownership of a loopback-only backend, closing and reopening, Weather Hub data persistence, safe upgrade over a previously installed `.deb`, and `sudo apt remove openrf` followed by checking that `~/.local/share/openrf/` personal readings/settings remain. Never delete a user data directory as part of uninstall testing. Kiosk startup is opt-in via `pi-startup.py`; test its enable/status/disable separately after installation.

## Verification results and limitations

- **Local regression preflight passed:** 539 Python unit tests, 140 JavaScript suites, Python compilation and JavaScript/Bash syntax checks with Python 3.12.14 and Node.js 24.22.3 in the Linux development container. This includes the v0.2.177 version, dependency, GPL, verifier and bundle-exclusion tests. The Windows wrapper itself and Python 3.11/3.14 CI matrix were not executed here.
- **Actual `.deb` build:** Electron 45.4.1 / electron-builder 26.18.1 successfully produced architecture-specific binary Debian installers in the Linux container. Package metadata/content inspections (not installations) confirmed version 0.2.177, correct architectures, old/new Debian dependency alternatives, desktop launcher, backend, Pi helper and license/copyright resources. Output hashes are recorded with the delivered files.
- Windows PowerShell launchers, full GUI installation/upgrade/remove, Raspberry Pi ARM64 touchscreen, GNSS, Wi-Fi/SDR hardware and weather sensors still need physical/manual verification. No physical hardware readings are claimed.
- Running the Windows updater for this ZIP normally commits and pushes managed source to GitHub; `Build-OpenRF-Deb.ps1` and `test-openrf-linux.sh` do not.
