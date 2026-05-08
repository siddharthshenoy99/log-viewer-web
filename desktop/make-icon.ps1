<#
.SYNOPSIS
  Create app.ico for the .exe from nvidia-logo.png.

.DESCRIPTION
  This is a one-time helper. Output: desktop\app.ico
  Falls back gracefully when ImageMagick / icotool are unavailable: it embeds the PNG
  inside a multi-size .ico file by hand.
#>
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$png = Resolve-Path (Join-Path $PSScriptRoot '..\nvidia-logo.png')
$ico = Join-Path $PSScriptRoot 'app.ico'

# Easiest path: rasterize the PNG into 16/32/48/64/128/256 PNG icons embedded in an ICO container.
Add-Type -AssemblyName System.Drawing

$sizes = 16,32,48,64,128,256

$src = [System.Drawing.Image]::FromFile($png)
$pngBytes = @{}
foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $s,$s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($src, 0, 0, $s, $s)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $pngBytes[$s] = $ms.ToArray()
}
$src.Dispose()

# Hand-build the .ico container: ICONDIR + ICONDIRENTRY x N + payloads.
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $out

# ICONDIR
$bw.Write([uint16]0)              # reserved
$bw.Write([uint16]1)              # icon
$bw.Write([uint16]$sizes.Count)   # count

$dataOffset = 6 + (16 * $sizes.Count)
$payloads = @()
foreach ($s in $sizes) {
  $bytes = $pngBytes[$s]
  $bw.Write([byte]($s % 256))     # width  (0 == 256)
  $bw.Write([byte]($s % 256))     # height (0 == 256)
  $bw.Write([byte]0)               # palette
  $bw.Write([byte]0)               # reserved
  $bw.Write([uint16]1)             # planes
  $bw.Write([uint16]32)            # bpp
  $bw.Write([uint32]$bytes.Length) # bytes
  $bw.Write([uint32]$dataOffset)   # offset
  $payloads += ,$bytes
  $dataOffset += $bytes.Length
}
foreach ($b in $payloads) { $bw.Write($b) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($ico, $out.ToArray())
$bw.Dispose()
$out.Dispose()

Write-Host "OK Created $ico"
