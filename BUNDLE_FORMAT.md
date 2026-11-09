# OpenRF release ZIP format (required by Update-OpenRF.ps1)

Every future release must be named `OpenRF-vX.Y.Z.zip` and contain these at its root:

```
openrf-bundle.json
project/
  app/...
  gradle/...
  gradlew
  gradlew.bat
  settings.gradle.kts
  ...
```

`openrf-bundle.json`:

```json
{
  "project": "OpenRF",
  "formatVersion": 1,
  "version": "0.1.0"
}
```

`project/` contains only the Android source and files the release owns. The updater copies them into `C:\projects\OpenRF`, remembers which files it managed, and removes *previously managed* files that are no longer in a release. Other local files are not deleted. Reserved installer paths, local state, `.git`, and sensitive filenames are not allowed inside a bundle. ZIP entry paths are checked before extraction.

Keep **Update-OpenRF.ps1**, **Setup-OpenRF.ps1**, and **.gitignore** out of `project/` so future releases cannot overwrite the installer or its exclusions. The existing `.github/workflows/android-apk.yml` can be managed separately, or explicitly included if updating the workflow. Do not include credentials, personal scan logs, or signed-release keystores in bundles.

## Update command

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The updater selects the most recently downloaded `OpenRF-v*.zip` in Downloads. To pick one explicitly, append `-ZipPath 'C:\path\OpenRF-v0.1.0.zip'`. To install without a GitHub push, append `-NoPush`.

The installer backs up overwritten/deleted managed files to `.openrf-state/backups/`. If an install fails while copying, it restores the prior files. A GitHub push failure leaves the local commit in place; rerun `git -C 'C:\projects\OpenRF' push origin HEAD` after fixing authentication/network access.
