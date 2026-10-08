@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\verify-cherrystudio.ps1" %*
set "patch_exit=%ERRORLEVEL%"
echo.
pause
exit /b %patch_exit%
