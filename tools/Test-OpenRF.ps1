# Run OpenRF's Linux tests locally from Windows PowerShell 5.1 or newer.
# Source location: C:\projects\OpenRF\tools\Test-OpenRF.ps1
# Requires Ubuntu/WSL and Node.js in WSL. The launcher does not install
# dependencies, change the Git index, commit, push or upload files. Test
# fixtures may use loopback HTTP servers and simulated hardware operations.
[CmdletBinding()]
param(
    [ValidatePattern('^python3(\.[0-9]+)?$')]
    [string]$PythonCommand = 'python3'
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

Write-Host 'Running OpenRF Python, JavaScript and shell checks in Ubuntu/WSL...' -ForegroundColor Cyan
& wsl.exe --cd $wslRoot[0].Trim() --exec bash ./tools/test-openrf-linux.sh $PythonCommand
if ($LASTEXITCODE -ne 0) {
    throw "OpenRF local tests failed (WSL exit $LASTEXITCODE). Nothing was committed or pushed."
}
Write-Host 'OpenRF local tests passed. No GitHub Actions run was started.' -ForegroundColor Green
