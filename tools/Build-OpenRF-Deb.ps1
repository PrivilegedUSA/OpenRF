# Run OpenRF's offline-first Linux desktop installer build on the local PC.
# Requires Windows 11, WSL Ubuntu, Python 3.11+, Node/npm and dpkg-deb in WSL.
# Builds .deb packages; never installs them, commits or pushes to GitHub.
[CmdletBinding()]
param(
    [ValidateSet('amd64','arm64','both')]
    [string]$Architecture = 'both'
)
$ErrorActionPreference = 'Stop'

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    throw 'Windows Subsystem for Linux (wsl.exe) was not found.'
}
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$wslRoot = @(& wsl.exe --exec wslpath -u $projectRoot | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or $wslRoot.Count -ne 1 -or [string]::IsNullOrWhiteSpace($wslRoot[0])) {
    throw "Could not map Windows project directory to a WSL path: $projectRoot"
}

Write-Host "Building OpenRF Debian package(s): $Architecture" -ForegroundColor Cyan
& wsl.exe --cd $wslRoot[0].Trim() --exec bash ./tools/build-openrf-deb.sh $Architecture
if ($LASTEXITCODE -ne 0) {
    throw "OpenRF Debian build/inspection failed (WSL exit $LASTEXITCODE). Nothing was pushed."
}
Write-Host 'Debian package(s) are in C:\projects\OpenRF\tools\openrf-electron\dist.' -ForegroundColor Green
Write-Host 'No GitHub Actions run was started.' -ForegroundColor Green
