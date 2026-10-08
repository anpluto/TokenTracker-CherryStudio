@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restore-cherrystudio.ps1" %*
set "patch_exit=%ERRORLEVEL%"
echo.
pause
exit /b %patch_exit%
