@echo off
rem Install the Command Code quota toolkit into the current user's ~/.zcode:
rem   scripts/commandcode-quota.py          the script
rem   commands/quota.md                     the /quota command
rem   skills/commandcode-quota/SKILL.md     natural-language trigger
rem Then patches the <YOUR_HOME> placeholder in the two .md files.
rem
rem Keep this file pure ASCII: cmd.exe parses it in the OEM codepage.
setlocal
set "SRC=%~dp0"
set "ZD=%USERPROFILE%\.zcode"

if not exist "%SRC%commandcode-quota.py" (
  echo [ERROR] commandcode-quota.py not found next to this script.
  echo         Run install-quota.cmd from inside the repo's quota\ directory.
  echo.
  pause
  exit /b 1
)

if not exist "%ZD%\scripts" mkdir "%ZD%\scripts"
if not exist "%ZD%\commands" mkdir "%ZD%\commands"
if not exist "%ZD%\skills\commandcode-quota" mkdir "%ZD%\skills\commandcode-quota"

copy /y "%SRC%commandcode-quota.py" "%ZD%\scripts\commandcode-quota.py" >nul
copy /y "%SRC%quota.md"             "%ZD%\commands\quota.md" >nul
copy /y "%SRC%SKILL.md"             "%ZD%\skills\commandcode-quota\SKILL.md" >nul
echo Copied the three files into %ZD%

powershell -NoProfile -ExecutionPolicy Bypass -File "%SRC%replace-placeholder.ps1"

echo.
echo Next steps:
echo   1) open a NEW ZCode conversation - commands and skills are loaded at startup
echo   2) then use /quota, or just ask "check the quota"
echo.
echo Verify from a terminal at any time:
echo   python "%ZD%\scripts\commandcode-quota.py"
echo.
pause
