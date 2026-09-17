@echo off
rem Stop cmdgo-bridge: kills the node process listening on the port and the
rem supervisor loop that owns it.
setlocal
if "%CMDGO_PORT%"=="" set "CMDGO_PORT=11435"

echo Stopping cmdgo-bridge (port %CMDGO_PORT%) ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%CMDGO_PORT%" ^| findstr "LISTENING"') do (
  echo   killing bridge PID %%p
  taskkill /f /pid %%p >nul 2>&1
)
for /f "tokens=2 delims=," %%q in ('tasklist /fi "imagename eq wscript.exe" /fo csv /nh 2^>nul') do (
  taskkill /f /pid %%~q >nul 2>&1
)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Where-Object { $_.CommandLine -like '*bridge-loop.cmd*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo Done. Port %CMDGO_PORT% should be free now.
timeout /t 3 >nul
