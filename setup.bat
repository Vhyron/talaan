@echo off
rem Talaan one-time setup for Windows: double-click, or run "setup.bat -Yes" to accept the defaults.
rem Does the work in setup.ps1 (dependencies, models, demo folders).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
set code=%errorlevel%
echo.
pause
exit /b %code%
