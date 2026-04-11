# Optional: serves this folder over HTTP using only built-in Windows PowerShell (no Python/Node/npm).
# Use if double-clicking index.html fails due to browser file-access limits. Press Ctrl+C to stop.
$ErrorActionPreference = "Stop"
$port = 8765
$root = $PSScriptRoot
$rootFull = [System.IO.Path]::GetFullPath($root)

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".txt"  = "text/plain; charset=utf-8"
    ".log"  = "text/plain; charset=utf-8"
    ".nfo"  = "text/plain; charset=utf-8"
    ".xml"  = "application/xml; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".woff" = "font/woff"
    ".woff2" = "font/woff2"
}

$prefix = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "Could not bind to $prefix - try another port or close apps using that port." -ForegroundColor Red
    Write-Host $_
    exit 1
}

$url = "http://localhost:$port/"
Write-Host "Serving: $rootFull" -ForegroundColor Cyan
Write-Host "Open in browser: $url" -ForegroundColor Green
try { Start-Process $url } catch { }

while ($listener.IsListening) {
    $ctx = $null
    try {
        $ctx = $listener.GetContext()
    } catch {
        break
    }
    if (-not $ctx) { continue }

    $req = $ctx.Request
    $res = $ctx.Response
    $path = [System.Uri]::UnescapeDataString($req.Url.LocalPath)
    if ($path -eq "/" -or $path -eq "") { $path = "/index.html" }

    $rel = $path.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    $candidate = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootFull, $rel))

    if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
        $res.Close()
        continue
    }

    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $res.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $res.ContentType = "text/plain; charset=utf-8"
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.Close()
        continue
    }

    $ext = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
    $ct = $mime[$ext]
    if (-not $ct) { $ct = 'application/octet-stream' }

    try {
        $bytes = [System.IO.File]::ReadAllBytes($candidate)
        $res.StatusCode = 200
        $res.ContentType = $ct
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
        $res.StatusCode = 500
    }
    $res.Close()
}

$listener.Stop()
$listener.Close()
