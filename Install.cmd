@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" -GameRoot "%~1"
set "result=%errorlevel%"
if not "%result%"=="0" echo Installation failed. Read the message above.
pause
exit /b %result%
