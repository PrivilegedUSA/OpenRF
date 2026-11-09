# OpenRF bundle installer. Searches Downloads for the newest OpenRF-v*.zip,
# safely validates it, installs only bundle-managed files, then commits and pushes.
# ZIP format is documented in BUNDLE_FORMAT.md. Never runs scripts from the ZIP.
[CmdletBinding()]
param(
    [string]$ProjectRoot = 'C:\projects\OpenRF',
    [string]$ZipPath,
    [switch]$NoPush
)
$ErrorActionPreference = 'Stop'

function Invoke-Git {
    param([string[]]$Arguments)
    & git -C $ProjectRoot @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git failed (exit $LASTEXITCODE): $($Arguments -join ' ')" }
}
function Assert-AllowedPath {
    param([string]$Relative)
    $p = $Relative.Replace('\','/')
    if ($p -match '(^/|^[A-Za-z]:|(^|/)\.\.(/|$)|(^|/)\.(/|$)|:)' -or $p.Contains([char]0)) {
        throw "Unsafe ZIP path: $p"
    }
    if ($p -match '^(?i:(\.git|\.openrf-state|local-data|private|secrets))(/|$)' -or
        $p -match '^(?i:(Update-OpenRF\.ps1|Setup-OpenRF\.ps1|\.gitignore|openrf-local\.json))$' -or
        $p -match '(?i:(^|/)\.env($|\.)|\.jks$|\.keystore$|\.p12$|\.pem$|\.key$)') {
        throw "Bundle tried to modify a protected file: $p"
    }
}
function Assert-NoReparsePoints {
    param([string]$Relative)
    $current = $ProjectRoot
    foreach ($piece in $Relative.Split('/')) {
        $current = Join-Path $current $piece
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Refusing to write through a junction/symlink: $current"
            }
        }
    }
}

if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    throw "Project folder not found: $ProjectRoot. Run Setup-OpenRF.ps1 first."
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is not installed.' }
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot '.git'))) {
    throw 'Git repository not initialized. Run Setup-OpenRF.ps1 first.'
}
$dirty = @(& git -C $ProjectRoot status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Git working tree.' }
if ($dirty.Count -gt 0) { throw 'Tracked local changes exist. Commit or stash them before installing a bundle.' }

if ([string]::IsNullOrWhiteSpace($ZipPath)) {
    $downloads = Join-Path $env:USERPROFILE 'Downloads'
    $candidate = Get-ChildItem -LiteralPath $downloads -File -Filter 'OpenRF-v*.zip' |
                 Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $candidate) { throw "No OpenRF-v*.zip found in $downloads. Use -ZipPath to specify one." }
    $ZipPath = $candidate.FullName
}
$ZipPath = (Resolve-Path -LiteralPath $ZipPath).Path
Write-Host "Selected bundle: $ZipPath" -ForegroundColor Cyan

# Inspect archive before extraction. Protect against traversal, symlinks and zip bombs.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
    if ($archive.Entries.Count -gt 30000) { throw 'Archive contains too many entries.' }
    [long]$totalSize = 0
    foreach ($entry in $archive.Entries) {
        $name = $entry.FullName.Replace('\','/')
        if ($name.StartsWith('/') -or $name -match '(^|/)\.\.(/|$)|(^|/)\.(/|$)|:' -or
            $name.Contains([char]0)) { throw "Unsafe archive entry: $name" }
        $unixType = ($entry.ExternalAttributes -shr 16) -band 61440
        if ($unixType -eq 40960) { throw "Archive contains a symbolic link: $name" }
        if ($entry.Length -gt 200MB) { throw "Oversized archive entry: $name" }
        $totalSize += $entry.Length
        if ($totalSize -gt 1GB) { throw 'Archive uncompressed size exceeds 1 GB.' }
        if (-not ($name -eq 'openrf-bundle.json' -or $name -eq 'project' -or
                   $name.StartsWith('project/'))) {
            throw "Unexpected archive entry outside bundle project/: $name"
        }
    }
} finally { $archive.Dispose() }

$stage = Join-Path ([IO.Path]::GetTempPath()) ('OpenRF-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $stage -Force
    $manifestPath = Join-Path $stage 'openrf-bundle.json'
    $payload = Join-Path $stage 'project'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $payload -PathType Container)) {
        throw 'Not a valid OpenRF bundle: missing openrf-bundle.json or project/ folder.'
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.project -cne 'OpenRF' -or [int]$manifest.formatVersion -ne 1 -or
        [string]::IsNullOrWhiteSpace($manifest.version)) { throw 'Invalid bundle manifest.' }

    $newPaths = @()
    foreach ($file in (Get-ChildItem -LiteralPath $payload -File -Recurse)) {
        $rel = $file.FullName.Substring($payload.Length).TrimStart('\','/').Replace('\','/')
        Assert-AllowedPath $rel
        Assert-NoReparsePoints $rel
        $newPaths += $rel
    }
    if ($newPaths.Count -eq 0) { throw 'Bundle contains no application files.' }
    $newPaths = @($newPaths | Sort-Object -Unique)

    $state = Join-Path $ProjectRoot '.openrf-state'
    $indexPath = Join-Path $state 'managed-files.txt'
    $oldPaths = @()
    if (Test-Path -LiteralPath $indexPath) {
        $oldPaths = @(Get-Content -LiteralPath $indexPath | Where-Object { $_ -ne '' })
        foreach ($path in $oldPaths) { Assert-AllowedPath $path }
    }
    $removed = @($oldPaths | Where-Object { $newPaths -notcontains $_ })
    $affected = @($newPaths + $removed | Sort-Object -Unique)

    # Do not overwrite unexpected untracked local files.
    foreach ($rel in $newPaths) {
        $target = Join-Path $ProjectRoot ($rel.Replace('/','\'))
        if (Test-Path -LiteralPath $target) {
            if ((Get-Item -LiteralPath $target -Force).PSIsContainer) { throw "File/directory conflict: $target" }
            if ($oldPaths -notcontains $rel) {
                & git -C $ProjectRoot ls-files --error-unmatch -- $rel *> $null
                if ($LASTEXITCODE -ne 0) { throw "Refusing to overwrite untracked local file: $target" }
            }
        }
    }
    foreach ($rel in $removed) { Assert-NoReparsePoints $rel }

    New-Item -ItemType Directory -Path $state -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $backup = Join-Path $state ('backups\' + $stamp)
    $existed = @{}
    foreach ($rel in $affected) {
        $target = Join-Path $ProjectRoot ($rel.Replace('/','\'))
        if (Test-Path -LiteralPath $target -PathType Leaf) {
            $existed[$rel] = $true
            $copyTo = Join-Path $backup ($rel.Replace('/','\'))
            New-Item -ItemType Directory -Path (Split-Path -Parent $copyTo) -Force | Out-Null
            Copy-Item -LiteralPath $target -Destination $copyTo -Force
        } else { $existed[$rel] = $false }
    }
    Write-Host "Backing up replaced files to: $backup"

    try {
        foreach ($rel in $newPaths) {
            $source = Join-Path $payload ($rel.Replace('/','\'))
            $target = Join-Path $ProjectRoot ($rel.Replace('/','\'))
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
            Copy-Item -LiteralPath $source -Destination $target -Force
        }
        foreach ($rel in $removed) {
            $target = Join-Path $ProjectRoot ($rel.Replace('/','\'))
            if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
        }
        Set-Content -LiteralPath $indexPath -Value $newPaths -Encoding UTF8
    } catch {
        Write-Warning 'Installation failed; restoring previous project files.'
        foreach ($rel in $affected) {
            $target = Join-Path $ProjectRoot ($rel.Replace('/','\'))
            if ($existed[$rel]) {
                $saved = Join-Path $backup ($rel.Replace('/','\'))
                Copy-Item -LiteralPath $saved -Destination $target -Force
            } elseif (Test-Path -LiteralPath $target -PathType Leaf) {
                Remove-Item -LiteralPath $target -Force
            }
        }
        throw
    }

    # Stage only files managed by these bundles (not unrelated local documents).
    for ($i = 0; $i -lt $affected.Count; $i += 50) {
        $end = [Math]::Min($i + 49, $affected.Count - 1)
        $batch = @($affected[$i..$end])
        Invoke-Git (@('add','-A','--') + $batch)
    }
    $staged = @(& git -C $ProjectRoot diff --cached --name-only)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect staged changes.' }
    if ($staged.Count -gt 0) {
        Invoke-Git @('commit','-m',"OpenRF v$($manifest.version)")
        Write-Host "Installed and committed OpenRF v$($manifest.version)." -ForegroundColor Green
        if (-not $NoPush) {
            $remotes = @(& git -C $ProjectRoot remote)
            if ($remotes -notcontains 'origin') {
                Write-Warning 'No GitHub origin remote configured. Run Setup-OpenRF.ps1 to enable automatic builds.'
            } else {
                Invoke-Git @('push','-u','origin','HEAD')
                Write-Host 'Pushed to GitHub. The Android APK workflow will start automatically.' -ForegroundColor Green
            }
        } else {
            Write-Host 'Upload skipped (-NoPush).'
        }
    } else {
        Write-Host 'No source changes to commit; bundle contents already match the project.'
    }
    Write-Host "Backup folder: $backup"
} finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
