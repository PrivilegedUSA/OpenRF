# v0.2.210 — Camera palette correction

Builds on v0.2.209. Red-light camera markers and keys are red (#d82f49), speed cameras yellow (#e4bf28), ALPR/Flock orange (#ee7828). Both raster and vector markers use the same JavaScript palette. Layer swatches and camera keys use matching CSS. Other map and mesh styling, navigation, radio adapters and cached directory data are unchanged. Release metadata and cache-busting asset versions are synchronized.

## Verification
- Full Python regression suite: 621 tests passed (Python 3.13.5), zero failures or skips.
- Full JavaScript suite: 168 scripts passed, including the updated camera palette and key consistency assertions.
- Python compilation, changed JavaScript syntax, and release version checks passed.
- Live map appearance, physical hardware, Windows updater and GitHub CI were not tested for this release.

## Installation and acceptance
Stop OpenRF. Download the complete cumulative ZIP; v0.2.209 is not a prerequisite. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath "$env:USERPROFILE\Downloads\OpenRF-v0.2.210.zip" -NoPush` from PowerShell, then `cd /mnt/c/projects/OpenRF && python3 -m openrf` from Ubuntu WSL. Reload the browser and check the three camera layer colors on the map and in the layer menu. Existing public directory cache does not need to be downloaded again solely because of this update.
