; NvidiaReportViewer-Setup.iss
;
; One-shot installer for the NVIDIA Report Viewer desktop app.
; Bundles:
;   * NvidiaReportViewer.exe (single-file, self-contained .NET 8)
;   * MicrosoftEdgeWebview2Setup.exe (Microsoft Evergreen Bootstrapper, only invoked on Win 10 if WebView2 is missing)
;
; Build with:
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" desktop\installer\NvidiaReportViewer-Setup.iss
;
; Output:  desktop\installer\out\NvidiaReportViewer-Setup.exe

#define MyAppName        "NVIDIA Report Viewer"
#define MyAppVersion     "1.6.3"
#define MyAppPublisher   "NVIDIA"
#define MyAppExeName     "NvidiaReportViewer.exe"
#define MyAppId          "{{A4F8B2D6-9F1E-4E18-B5A0-37AA3F1B3210}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://github.com/siddharthshenoy99/log-viewer-web
DefaultDirName={autopf}\NvidiaReportViewer
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=out
OutputBaseFilename=NvidiaReportViewer-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoProductName={#MyAppName}
VersionInfoDescription={#MyAppName} setup
WizardSmallImageFile=
WizardImageFile=
ShowLanguageDialog=auto
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "..\dist\NvidiaReportViewer.exe"; DestDir: "{app}"; Flags: ignoreversion
; Drop the icon next to the .exe so shortcuts and the Start Menu can reference an absolute file
; (Inno Setup pulls icons embedded inside .exe files lazily; a side-by-side .ico is a stable backup).
Source: "..\app.ico"; DestDir: "{app}"; DestName: "NvidiaReportViewer.ico"; Flags: ignoreversion
Source: "redist\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
; AppUserModelID matches Program.cs so Windows groups taskbar / pinned shortcuts under our identity.
Name: "{group}\{#MyAppName}";        Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\NvidiaReportViewer.ico"; AppUserModelID: "NVIDIA.ReportViewer.Desktop"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\NvidiaReportViewer.ico"; AppUserModelID: "NVIDIA.ReportViewer.Desktop"; Tasks: desktopicon

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; Flags: waituntilterminated; Check: NeedsWebView2; StatusMsg: "Installing Microsoft Edge WebView2 Runtime (one-time, ~50 MB)..."
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
{ Detect whether the WebView2 Evergreen Runtime is already present.
  Win 11 ships it, Win 10 21H2+ usually has it via Edge — but a clean image / N edition can lack it.
  Reads pv (product version) under HKLM/HKCU; non-empty version means installed. }
function NeedsWebView2: Boolean;
var
  v: string;
begin
  Result := True;
  if RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', v) and (v <> '') and (v <> '0.0.0.0') then
  begin
    Result := False;
    Exit;
  end;
  if RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', v) and (v <> '') and (v <> '0.0.0.0') then
  begin
    Result := False;
    Exit;
  end;
  if RegQueryStringValue(HKEY_CURRENT_USER,
    'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', v) and (v <> '') and (v <> '0.0.0.0') then
  begin
    Result := False;
    Exit;
  end;
end;
