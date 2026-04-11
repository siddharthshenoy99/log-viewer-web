@echo off
setlocal EnableExtensions
REM Opens index.html next to this file. Requires a real folder — not "inside" a ZIP preview.

cd /d "%~dp0"

if exist "index.html" goto :launch

echo.
echo ============================================================
echo   Could not find index.html next to this batch file.
echo   Folder: %CD%
echo ============================================================
echo.
echo This often happens when you run a file from inside a ZIP
echo archive. Windows may use a temporary folder and only copy
echo some files, so index.html is missing.
echo.
echo Fix:
echo   1. Right-click the ZIP in File Explorer
echo   2. Choose "Extract All..." and pick a real folder
echo   3. Open the extracted "log-viewer-web" folder
echo   4. Double-click index.html  OR  run this .bat again
echo.
pause
exit /b 1

:launch
start "" "%~dp0index.html"
goto :eof
