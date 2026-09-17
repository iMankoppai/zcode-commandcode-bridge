@echo off
rem Start cmdgo-bridge in a visible window (shows live logs) - handy for troubleshooting.
rem Endpoint: http://127.0.0.1:11435/v1   Console: http://127.0.0.1:11435/
rem Keep the window open while you use it; closing it stops the bridge.

setlocal
cd /d "%~dp0"
if "%CMDGO_DIR%"=="" set "CMDGO_DIR=%~dp0cmdgo-bridge"
if "%CMDGO_DATA_DIR%"=="" set "CMDGO_DATA_DIR=%~dp0cmdgo-bridge-data"
if "%CMDGO_PORT%"=="" set "CMDGO_PORT=11435"

if not exist "%CMDGO_DIR%\dist\index.js" (
  echo [ERROR] %CMDGO_DIR%\dist\index.js not found - build upstream first (see README).
  pause
  exit /b 1
)
echo Starting cmdgo-bridge on 127.0.0.1:%CMDGO_PORT% ...
node "%CMDGO_DIR%\dist\index.js" --data-dir "%CMDGO_DATA_DIR%" --port %CMDGO_PORT%
pause
