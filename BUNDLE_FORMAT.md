# OpenRF release ZIP format (required by Update-OpenRF.ps1)

Every future release must be named `OpenRF-vX.Y.Z.zip` and contain these at its root:

```
openrf-bundle.json
project/
  openrf/           # Python backend + local frontend
  tests/            # Python + JavaScript regressions
  tools/            # Linux/Pi build and optional device helpers
  .github/workflows/openrf-linux.yml
  README.md
  CHANGELOG.md
```

`openrf-bundle.json`:

```json
{
  "project": "OpenRF",
  "formatVersion": 1,
  "version": "0.2.216"
}
```

`project/` contains the installable Linux/Python OpenRF source and managed release files, including its archived Android sources under `legacy/` for reference. The updater copies managed paths into `C:\projects\OpenRF`, remembers which files it managed, and removes *previously managed* files that are no longer in a release. Other local files are not deleted. Reserved installer paths, local state, `.git`, and sensitive filenames are not allowed inside a bundle. ZIP entry paths are checked before extraction.

Keep **Update-OpenRF.ps1**, **Setup-OpenRF.ps1**, and **.gitignore** out of `project/` so future releases cannot overwrite the installer or its exclusions. The managed `.github/workflows/openrf-linux.yml` runs Python and JavaScript tests, not Android APK builds. Do not include credentials, personal scan logs, RNS identities, or signing keys in bundles.

## Update command

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The updater selects the most recently downloaded `OpenRF-v*.zip` in Downloads. To pick one explicitly, append `-ZipPath 'C:\path\OpenRF-v0.1.0.zip'`. To install without a GitHub push, append `-NoPush`.

The installer backs up overwritten/deleted managed files to `.openrf-state/backups/`. If an install fails while copying, it restores the prior files. A GitHub push failure leaves the local commit in place; rerun `git -C 'C:\projects\OpenRF' push origin HEAD` after fixing authentication/network access.
