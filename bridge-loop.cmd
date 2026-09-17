@echo off
rem cmdgo-bridge supervisor loop (Windows).
rem Restarts the bridge if it exits; does nothing while an instance is already
rem listening on the port, so a manually started instance and the logon
rem autostart one never fight over the port.
rem
rem Keep this file pure ASCII: cmd.exe parses it in the OEM codepage.

setlocal
cd /d "%~dp0"

if "%CMDGO_DIR%"=="" set "CMDGO_DIR=%~dp0cmdgo-bridge"
if "%CMDGO_DATA_DIR%"=="" set "CMDGO_DATA_DIR=%~dp0cmdgo-bridge-data"
if "%CMDGO_PORT%"=="" set "CMDGO_PORT=11435"

if not exist "%CMDGO_DIR%\dist\index.js" (
  echo [ERROR] %CMDGO_DIR%\dist\index.js not found.
  echo         Get upstream and build it first:
  echo           git clone https://github.com/Patrick-mufeng/cmdgo-bridge.git "%%CMDGO_DIR%%"
  echo           cd /d "%%CMDGO_DIR%%" ^&^& npm install ^&^& npm run build
  echo         On Windows also apply patches\cmdgo-bridge-max-tokens.patch (see patches\README.md).
  pause
  exit /b 1
)

:loop
netstat -ano | findstr ":%CMDGO_PORT%" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  timeout /t 30 /nobreak >nul
  goto loop
)

node "%CMDGO_DIR%\dist\index.js" --data-dir "%CMDGO_DATA_DIR%" --port %CMDGO_PORT%
echo [%date% %time%] bridge exited, restarting in 5s ... >> "%CMDGO_DATA_DIR%\supervisor.log"
timeout /t 5 /nobreak >nul
goto loop
