# OpenRF v0.2.169 — Hardware navigation, spacing and release integrity

## Changes

This patch starts from the validated **complete OpenRF v0.2.168** source bundle. It preserves the Weather Station foundation, Meshtastic/MeshCore/Reticulum messaging, map/navigation, emergency functions and all existing Linux hardware capabilities.

Hardware now contains four consistent, touch-friendly navigation tabs:

| Tab | Existing panels grouped here |
| --- | --- |
| **Dashboard** | Connection overview; Linux hardware capability tiles; Wi-Fi readiness summary |
| **Radios & Networks** | Mesh radio connections; opt-in field network/Wi-Fi hotspot; passive Wi-Fi HaLow diagnostics |
| **USB & Sensors** | Detected host devices; sensor driver registry; manual OpenRF Serial v1 USB probe/snapshot |
| **System** | Hardware readiness checklist and JSON export; operating environment |

All existing elements and their event handlers are moved into tab panels, not recreated. No new driver, protocol or network behavior is added. In particular, selecting a tab does not open a USB port, start a hotspot, scan, transmit, send or announce.

Added 16px panel-to-panel spacing on Ham Radio (Baofeng channel list versus Radio Tools), Sessions (Current Field Survey versus Saved Investigation History and following cards), and within all Hardware tabs. External USB Sensor and Operating Environment no longer share the same tab.

## Automated tests

From the extracted `project/` directory on WSL Ubuntu or Raspberry Pi OS:

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
node --check openrf/static/hardware-tabs.js
node --check openrf/static/app.js
for test_file in tests/*.js; do node "$test_file" || exit 1; done
```

`tests/test_hardware_tabs_v169.js` verifies the actual HTML element IDs, all four tab contents, moving exact DOM nodes, default selection, accessible keyboard navigation, no automatic radio calls and CSS rules for card gaps. The existing loopback HTTP static-asset suite verifies the new script returns 200 instead of 404.

**Local result on 2026-11-21:** 482 Python tests and all 137 JavaScript suites passed. Python compilation and JavaScript syntax checks succeeded. No connected radio or 1280×800 touchscreen was available for a visual acceptance test.

## Installation and ZIP troubleshooting

**Reported user symptom:** The updater selected `OpenRF-v0.2.168(1).zip` and Windows `.NET ZipFile.OpenRead` failed with `Central Directory corrupt`. The archived v0.2.168 source ZIP was intact in the development environment (`zipfile.testzip()` returned no damaged entry), but the actual `(1)` copy on the user's PC was **not inspected**. An incomplete download, altered file or external ZIP packaging incompatibility cannot be distinguished from that transcript alone. The failure happened before installation, and does not prove the installation script modified managed files.

The new v0.2.169 release is generated using plain **ZIP32 Deflate, no ZIP64 or unusual extra fields**. It is checked by Python `zipfile` and Linux `unzip -t`. This improves compatibility but cannot fix an incomplete download on the user's computer.

Download the **complete** v0.2.169 ZIP to `C:\Users\brand\Downloads`. Avoid confusing it with old `(1)` copies. Verify its size and optionally test its ZIP central directory in PowerShell before installing:

```powershell
$zip = 'C:\Users\brand\Downloads\OpenRF-v0.2.169.zip'
Get-Item -LiteralPath $zip | Select-Object Name, Length
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
$archive.Dispose()
```

If the above test fails, download the ZIP again and compare its byte size to the release details; the issue is with that local ZIP before the updater can install it. If it succeeds, run the updater selecting **that exact file** (adjust the filename if the browser added `(1)`):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath 'C:\Users\brand\Downloads\OpenRF-v0.2.169.zip'
```

Then start in Ubuntu WSL:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

The updater's GitHub push and user's actual install are **not verified** by the software build. Do not claim that a local ZIP integrity test guarantees every downstream installation stage will succeed.

## Manual UI checks

1. On Ham Radio, verify a visible gap between My Baofeng Channel Lists and Radio Tools at 1280×800 and smaller widths.
2. On Sessions, verify a gap beneath Current Field Survey before Saved Investigation History, and between following report/snapshot cards.
3. On Hardware, open each of the four tabs and confirm the original panels, controls and their values appear. Switching tabs must not jump the page or connect/scan anything. Verify no horizontal tab scrollbar on the 7-inch screen.
4. Use an intentionally selected read-only Refresh button to confirm existing inventory; confirm the optional field hotspot and USB sensor buttons still require explicit operator action. Do not connect to unknown hardware for this UI check.
5. Check Weather Station, Map, all three messaging systems and Reticulum Files to verify no missing assets or changes to their controls.

No physical Pi touchscreen, connected USB sensors, Wi-Fi HaLow module, field hotspot or real radio was available for this release verification. Browser screenshot automation may be restricted by the test environment; treat real 1280×800 layout as manual acceptance testing.

## Files changed

- `openrf/static/index.html`, `app.css`, `hardware-tabs.js` (new) — tab layout and measured card gaps
- `openrf/server.py` — explicit static asset route for hardware tab controller
- `tests/test_hardware_tabs_v169.js` (new) — DOM/CSS/interaction regression
- `.github/workflows/openrf-linux.yml` — additional JavaScript syntax check
- Versioned source metadata, Electron version, existing version-aware test assertions, `README.md`, `CHANGELOG.md`, `BUNDLE_FORMAT.md`, this document and root `openrf-bundle.json`

The full ZIP contains managed source only under `project/` plus the root manifest. User updater scripts, `.git`, credentials and locally collected data are not bundled.
