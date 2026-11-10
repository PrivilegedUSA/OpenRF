# Starts the Linux edition inside WSL. Run in a separate PowerShell terminal.
[CmdletBinding()]
param([int]$Port = 8765)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    throw 'Windows Subsystem for Linux is not available. Install WSL/Ubuntu first.'
}
if (-not (Test-Path -LiteralPath 'C:\projects\OpenRF\openrf\server.py')) {
    throw 'OpenRF Linux application not found. Install OpenRF-v0.2.0.zip with Update-OpenRF.ps1.'
}
Write-Host "Open http://localhost:$Port in a Windows web browser." -ForegroundColor Cyan
Write-Host 'This console runs the OpenRF server. Press Ctrl+C to stop.'
& wsl.exe --cd /mnt/c/projects/OpenRF python3 -m openrf --port $Port
if ($LASTEXITCODE -ne 0) { throw "OpenRF exited with code $LASTEXITCODE" }
