# NVIDIA Report Viewer — Desktop (single-file `.exe`)

A tiny WebView2 host that wraps the static web app (`index.html`, `app.js`, `styles.css`,
`nvidia-logo.png`, `vendor/jspdf.umd.min.js`) into a single self-contained Windows
executable. Same UI, same features, same offline behaviour.

## What you get

| Output | Path | Approx. size | Notes |
|---|---|---|---|
| `NvidiaReportViewer.exe` | `desktop/dist/NvidiaReportViewer.exe` | ~10–15 MB | Self-contained .NET 8, single file |

The web assets are **embedded as resources inside the `.exe`** — no temp folder
extraction, no separate `webroot/` to ship.

## Prerequisites

- Windows 10 64-bit (1809 or later) or Windows 11 64-bit
- **.NET 8 SDK** for building only:
  ```powershell
  winget install Microsoft.DotNet.SDK.8
  ```
  End users do NOT need the SDK; the `.exe` is self-contained.
- **Microsoft Edge WebView2 runtime** at runtime: pre-installed on Windows 11.
  Windows 10 users without it get a one-line install pointer the first time the
  app starts.

## Build

```powershell
cd desktop
.\make-icon.ps1     # one-time: creates app.ico from ..\nvidia-logo.png
.\build.ps1         # produces dist\NvidiaReportViewer.exe
```

## Build with self-signed Authenticode

```powershell
.\sign-selfsign.ps1   # one-time: creates desktop\selfsign.pfx (password "changeit")
.\build.ps1 -Sign     # signs the produced .exe
```

> Self-signed certs **do not** remove SmartScreen warnings; they only help internal AV
> products if your IT pushes the cert into the trusted root. For external distribution
> use a real Authenticode (or EV) certificate and call `build.ps1 -SignWith C:\my.pfx
> -SignPassword '…'`.

## Distribute

Send the single `dist\NvidiaReportViewer.exe` to your colleagues. They double-click and
the same web UI opens in a Windows window. No installer, no extracted folder, no
configuration. The executable does not phone home, write to the registry, or require
admin privileges.

User profile data (WebView2 cache for the embedded site) is kept under
`%LocalAppData%\NvidiaReportViewer\WebView2`. Delete that folder to reset state.

## Security model

- The shell loads the embedded files via `https://app.local/...` using
  `SetVirtualHostNameToFolderMapping` so HTML/JS/CSS run with full browser semantics
  while staying entirely offline.
- The `WebView2` is sandboxed by Edge’s normal site isolation.
- Right-click context menu and dev tools are disabled in `Release` builds.
- External hyperlinks open in the user’s default browser, never inside the app shell.
- Downloads default to the user’s `Downloads` folder.

## SmartScreen tips for AV-friendly distribution

1. Build with `-Sign` (real cert is best). An EV cert removes SmartScreen prompts
   immediately; a standard Authenticode cert removes them once the file builds
   reputation.
2. Avoid renaming `NvidiaReportViewer.exe` — file-hash reputation resets every rename.
3. Submit the binary to Microsoft Defender for false-positive review if needed:
   <https://www.microsoft.com/wdsi/filesubmission>.

## Troubleshooting

- **"WebView2 not installed"** on first launch (Win 10 only): install the Evergreen
  runtime from <https://developer.microsoft.com/microsoft-edge/webview2/>.
- **Antivirus quarantine** before signing: most AV vendors flag unsigned .NET
  single-file binaries. Sign with a real cert, or whitelist by hash.
