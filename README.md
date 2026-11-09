# OpenRF — local setup kit

This ZIP contains **tooling and project instructions**, not the Android application. The first Android project source bundle will arrive separately as `OpenRF-v0.1.0.zip`.

## Install Git and GitHub CLI (one time)

In PowerShell, if missing:

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
```

Close and reopen PowerShell so `git` and `gh` are available.

## Extract this kit (one time)

Download `OpenRF-Tooling-Kit.zip` to your Downloads folder, then run:

```powershell
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\OpenRF-Tooling-Kit.zip" -DestinationPath 'C:\projects\OpenRF' -Force
```

Review the scripts before execution. The setup script creates a **private** GitHub repository named `OpenRF` by default and never stores passwords or tokens.

## Initialize GitHub (one time)

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Setup-OpenRF.ps1'
```

Follow GitHub authentication prompts. If GitHub rejects pushing `.github/workflows`, run `gh auth refresh --scopes workflow`, then retry setup. `-Public` may be supplied if you intentionally want a public repository from the beginning. If a remote named `origin` already exists, setup uses that remote instead of creating a new repository.

## Install each new release (one line)

1. Download the new `OpenRF-vX.Y.Z.zip` bundle to Downloads, without extracting it.
2. Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The script selects the newest matching ZIP, validates paths and manifest, backs up replaced files, installs it, commits the managed files, and pushes to `origin`. Each push to `main` triggers GitHub Actions. Once Android source exists, a **debug APK** will be available in the workflow run's **Artifacts** section; it will not be automatically installed on the phone.

Optional: `-ZipPath 'C:\somewhere\OpenRF-v0.1.0.zip'` selects an exact bundle. `-NoPush` does not upload to GitHub.

## Important cautions

- Run bundles and scripts **only from sources you trust**. GitHub Actions executes project build code.
- The installer refuses to overwrite unexpected untracked files or run when tracked local changes exist.
- Backups live under `.openrf-state/backups/`. Personal investigation data belongs under `local-data/` and is ignored by Git.
- If the repo is not on `main`, the `main` branch push workflow may not run. New setups use `main`.
- GitHub Actions builds depend on network availability and external Gradle/Android dependencies; a push triggers an attempt, not a guaranteed successful build.
- The workflow intentionally skips APK compilation until the first Android source bundle is installed.

See `BUNDLE_FORMAT.md` for the release format future ChatGPT patches must use.
