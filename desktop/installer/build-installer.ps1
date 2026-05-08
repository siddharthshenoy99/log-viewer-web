<#
.SYNOPSIS
  Build a single-file Windows installer for NVIDIA Report Viewer.

.DESCRIPTION
  Steps:
   1. Make sure desktop\dist\NvidiaReportViewer.exe exists (build it via desktop\build.ps1 if not).
   2. Make sure desktop\installer\redist\MicrosoftEdgeWebview2Setup.exe exists (download if not).
   3. Run Inno Setup (ISCC) to produce desktop\installer\out\NvidiaReportViewer-Setup.exe.

.USAGE
  PS> .\build-installer.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$root         = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$desktopRoot  = Resolve-Path (Join-Path $PSScriptRoot '..')
$exePath      = Join-Path $desktopRoot 'dist\NvidiaReportViewer.exe'
$wv2Path      = Join-Path $PSScriptRoot 'redist\MicrosoftEdgeWebview2Setup.exe'
$outDir       = Join-Path $PSScriptRoot 'out'

if (-not (Test-Path $exePath)) {
  Write-Host "Step 0: NvidiaReportViewer.exe not present - running desktop\build.ps1 first"
  Push-Location $desktopRoot
  try {
    & powershell -ExecutionPolicy Bypass -File .\build.ps1
    if ($LASTEXITCODE -ne 0) { throw ".\build.ps1 failed (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $wv2Path)) {
  Write-Host "Step 0b: Downloading WebView2 Evergreen Bootstrapper"
  New-Item -ItemType Directory -Force -Path (Split-Path $wv2Path) | Out-Null
  Invoke-WebRequest `
    -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' `
    -OutFile $wv2Path -UseBasicParsing
}

$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
  Write-Error "Inno Setup not found. Install with:  winget install JRSoftware.InnoSetup"
}

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

Write-Host "Step 1: Compiling installer with $iscc"
& $iscc 'NvidiaReportViewer-Setup.iss'
if ($LASTEXITCODE -ne 0) { throw "ISCC failed (exit $LASTEXITCODE)" }

$setup = Join-Path $outDir 'NvidiaReportViewer-Setup.exe'
if (-not (Test-Path $setup)) { throw "Installer not produced at $setup" }

$size = '{0:N1} MB' -f ((Get-Item $setup).Length / 1MB)
Write-Host ""
Write-Host "OK Installer built"
Write-Host "  Output : $setup"
Write-Host "  Size   : $size"
