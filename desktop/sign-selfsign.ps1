<#
.SYNOPSIS
  Generate a self-signed Authenticode certificate for development use.

.DESCRIPTION
  Produces  desktop\selfsign.pfx (password "changeit").
  Notes:
   - Self-signed certs do NOT remove SmartScreen warnings; they only let internal AV products
     trust the binary if your IT pushes the cert root into the machine store.
   - For production, replace selfsign.pfx with a real Authenticode (or EV) certificate.
#>

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$cert = New-SelfSignedCertificate `
  -Subject "CN=NVIDIA Report Viewer (dev), O=NVIDIA, C=US" `
  -Type CodeSigningCert `
  -KeyAlgorithm RSA `
  -KeyLength 3072 `
  -HashAlgorithm SHA256 `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -NotAfter (Get-Date).AddYears(3) `
  -KeyExportPolicy Exportable

$pwd = ConvertTo-SecureString -String 'changeit' -Force -AsPlainText
$pfx = Join-Path $PSScriptRoot 'selfsign.pfx'
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $pwd | Out-Null

Write-Host ""
Write-Host "OK Self-signed certificate created"
Write-Host "  Thumbprint : $($cert.Thumbprint)"
Write-Host "  Saved to   : $pfx"
Write-Host ""
Write-Host "Next: build with signing"
Write-Host "  .\build.ps1 -Sign"
