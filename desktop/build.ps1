<#
.SYNOPSIS
  Build a single-file portable NvidiaReportViewer.exe (Windows x64).

.DESCRIPTION
  Wraps the static web app (index.html, app.js, styles.css, vendor/, logo) inside a tiny
  WebView2 host. Output: dist\NvidiaReportViewer.exe (~10–15 MB self-contained).

  Requirements:
    - .NET 8 SDK         winget install Microsoft.DotNet.SDK.8
    - Optional, signing: a self-signed PFX produced by .\sign-selfsign.ps1

.USAGE
  PS> .\build.ps1                      # plain build
  PS> .\build.ps1 -Sign                # also Authenticode-sign with the self-signed cert
  PS> .\build.ps1 -SignWith C:\my.pfx -SignPassword 'secret'
#>

[CmdletBinding()]
param(
  [switch]$Sign,
  [string]$SignWith,
  [string]$SignPassword,
  [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host "Step 1: Verifying .NET 8 SDK is present"
$dotnetInfo = (& dotnet --info) -join "`n"
if ($dotnetInfo -notmatch '\.NET SDKs installed:[\s\S]+?(8\.0\.\d+)') {
  Write-Error "No .NET 8 SDK found. Install with:  winget install Microsoft.DotNet.SDK.8"
}

# Make sure the parent web assets exist (we embed them as resources at compile time).
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
foreach ($f in @('index.html','styles.css','app.js','favicon.svg','nvidia-logo.png','vendor\jspdf.umd.min.js')) {
  $p = Join-Path $repoRoot $f
  if (-not (Test-Path $p)) { Write-Error "Missing required web asset: $p" }
}

$dist = Join-Path $PSScriptRoot 'dist'
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
New-Item -ItemType Directory -Path $dist | Out-Null

Write-Host "Step 2: dotnet restore"
& dotnet restore | Write-Host

Write-Host "Step 3: dotnet publish (single-file, self-contained, win-x64)"
& dotnet publish `
  -c $Configuration `
  -r win-x64 `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -p:EnableCompressionInSingleFile=true `
  -p:PublishTrimmed=false `
  -o $dist | Write-Host

$exe = Join-Path $dist 'NvidiaReportViewer.exe'
if (-not (Test-Path $exe)) { Write-Error "Build did not produce $exe" }

# Strip extra files: a single-file publish leaves a couple of WebView2 .pdb / loader libs you do not ship.
Get-ChildItem -Path $dist -File | Where-Object { $_.Name -ne 'NvidiaReportViewer.exe' } | Remove-Item -Force

# Optional Authenticode signing.
if ($Sign -or $SignWith) {
  $pfx = if ($SignWith) { $SignWith } else { Join-Path $PSScriptRoot 'selfsign.pfx' }
  if (-not (Test-Path $pfx)) {
    Write-Error "Sign requested but no PFX found. Run .\sign-selfsign.ps1 first or pass -SignWith path."
  }
  $pwd = if ($SignPassword) { $SignPassword } else { 'changeit' }
  Write-Host "Step 4: Authenticode signing $exe with $pfx"

  # Prefer signtool.exe (with timestamp); fall back to PowerShell's Set-AuthenticodeSignature when the SDK is absent.
  $candidates = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe",
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.22000.0\x64\signtool.exe",
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\x64\signtool.exe"
  )
  $signtool = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($signtool) {
    & $signtool sign /fd SHA256 /tr 'http://timestamp.digicert.com' /td SHA256 /f $pfx /p $pwd $exe
  } else {
    Write-Host "  (signtool.exe not found - using Set-AuthenticodeSignature)"
    $sec = ConvertTo-SecureString -String $pwd -Force -AsPlainText
    # PowerShell 5.1 Get-PfxCertificate has no -Password; load via .NET directly.
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $pfx, $sec, 'Exportable'
    Set-AuthenticodeSignature -FilePath $exe -Certificate $cert -HashAlgorithm SHA256 -TimestampServer 'http://timestamp.digicert.com' | Out-Null
    $sig = Get-AuthenticodeSignature -FilePath $exe
    Write-Host "  Signature status : $($sig.Status)"
    Write-Host "  Signer subject   : $($sig.SignerCertificate.Subject)"
  }
}

$size = '{0:N1} MB' -f ((Get-Item $exe).Length / 1MB)
Write-Host ""
Write-Host "OK Build complete"
Write-Host "  Output : $exe"
Write-Host "  Size   : $size"
Write-Host "  Run    : double-click NvidiaReportViewer.exe"
