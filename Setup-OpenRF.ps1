# One-time OpenRF GitHub setup. Creates a PRIVATE repository unless -Public is supplied.
# Run after reviewing the script and installing Git and GitHub CLI (gh).
[CmdletBinding()]
param(
    [string]$ProjectRoot = 'C:\projects\OpenRF',
    [switch]$Public
)
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Exe, [string[]]$Arguments)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe failed (exit $LASTEXITCODE): $($Arguments -join ' ')" }
}

foreach ($tool in @('git', 'gh')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Missing $tool. Install Git and GitHub CLI, reopen PowerShell, then retry."
    }
}
if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    New-Item -ItemType Directory -Path $ProjectRoot -Force | Out-Null
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot '.git'))) {
    Invoke-Checked 'git' @('-C', $ProjectRoot, 'init', '-b', 'main')
}

foreach ($field in @('user.name', 'user.email')) {
    $value = & git -C $ProjectRoot config --get $field 2>$null
    if ([string]::IsNullOrWhiteSpace(($value | Out-String).Trim())) {
        $answer = Read-Host "Git $field is not configured for this repository. Enter a value"
        if ([string]::IsNullOrWhiteSpace($answer)) { throw "A value for $field is required." }
        Invoke-Checked 'git' @('-C', $ProjectRoot, 'config', '--local', $field, $answer)
    }
}

$starterPaths = @('Setup-OpenRF.ps1','Update-OpenRF.ps1','README.md',
                  'PROJECT_INSTRUCTIONS.md','BUNDLE_FORMAT.md','.gitignore',
                  '.github/workflows/android-apk.yml')
foreach ($path in $starterPaths) {
    if (Test-Path -LiteralPath (Join-Path $ProjectRoot $path)) {
        Invoke-Checked 'git' @('-C', $ProjectRoot, 'add', '--', $path)
    }
}
$staged = @(& git -C $ProjectRoot diff --cached --name-only)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect staged files.' }
if ($staged.Count -gt 0) {
    Invoke-Checked 'git' @('-C', $ProjectRoot, 'commit', '-m', 'Initialize OpenRF project tooling')
}

# gh auth status writes to stderr when logged out; probe without escalating that to an exception.
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    & gh auth status *> $null
    $authenticated = ($LASTEXITCODE -eq 0)
} finally { $ErrorActionPreference = $previousPreference }
if (-not $authenticated) {
    Write-Host 'GitHub authentication is required. Follow the prompts.' -ForegroundColor Yellow
    Invoke-Checked 'gh' @('auth', 'login', '--scopes', 'workflow')
}
Invoke-Checked 'gh' @('auth', 'setup-git')

$existing = @(& git -C $ProjectRoot remote)
if ($LASTEXITCODE -ne 0) { throw 'Cannot check Git remotes.' }
if ($existing -contains 'origin') {
    Write-Host 'origin already exists; using the existing GitHub repository.' -ForegroundColor Yellow
    Invoke-Checked 'git' @('-C', $ProjectRoot, 'push', '-u', 'origin', 'HEAD')
} else {
    $visibility = if ($Public) { '--public' } else { '--private' }
    Write-Host "Creating GitHub repository OpenRF ($visibility)..."
    Invoke-Checked 'gh' @('repo','create','OpenRF',$visibility,'--source',$ProjectRoot,'--remote','origin','--push')
}
Write-Host 'Setup complete. New bundle updates can now push to GitHub automatically.' -ForegroundColor Green
Write-Host 'GitHub Actions will build an APK after Android application source is added.'
