@echo off
setlocal EnableExtensions
title CryptoDocs - Setup and Launch
cd /d "%~dp0"

echo ==================================================
echo   CryptoDocs - Offline Cryptographic Attribution
echo ==================================================
echo.

REM ---------- 1. Node.js check ----------
where node >nul 2>nul
if errorlevel 1 goto :install_node
goto :check_version

:install_node
echo [!] Node.js was not found.
where winget >nul 2>nul
if errorlevel 1 goto :manual_node
echo [*] Installing Node.js 22 LTS with winget. Accept any prompt that appears...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo.
echo [i] Node.js installed. Close this window and run Start.bat again
echo     so Windows picks up the new PATH.
pause
exit /b 0

:manual_node
echo [X] winget is not available on this PC.
echo     Install Node.js 20 or newer from https://nodejs.org then run Start.bat again.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:check_version
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODEMAJOR=%%v"
set "NODEMAJOR=%NODEMAJOR:v=%"
if %NODEMAJOR% LSS 20 (
  echo [X] Node.js %NODEMAJOR% is too old. Install Node.js 20 or newer from https://nodejs.org
  pause
  exit /b 1
)
for /f %%v in ('node -v') do echo [OK] Node.js %%v
for /f %%v in ('npm -v') do echo [OK] npm %%v
echo.

REM ---------- 2. Install dependencies ----------
set "NEEDINSTALL=0"
if not exist "node_modules" set "NEEDINSTALL=1"
if not exist "node_modules\.package-lock.json" set "NEEDINSTALL=1"
if exist "node_modules\.package-lock.json" if exist "package-lock.json" (
  REM reinstall when package.json is newer than the last install marker
  for %%A in ("package.json") do for %%B in ("node_modules\.package-lock.json") do (
    if "%%~tA" GTR "%%~tB" set "NEEDINSTALL=1"
  )
)

if "%NEEDINSTALL%"=="1" (
  echo [*] Installing dependencies - first run needs internet, later runs are offline...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [X] npm install failed. Check your internet connection and try again.
    echo     If it keeps failing, delete the node_modules folder and rerun Start.bat.
    pause
    exit /b 1
  )
) else (
  echo [OK] Dependencies already installed - skipping.
)
echo.

REM ---------- 3. Optional self-test ----------
if /I "%~1"=="test" (
  echo [*] Running test suite...
  call npm test
  pause
  exit /b %errorlevel%
)

REM ---------- 4. Launch ----------
echo [*] Starting CryptoDocs. Your browser will open automatically.
echo     Keep this window open while using the app. Press Ctrl+C to stop.
echo.
call npm run dev -- --open
if errorlevel 1 (
  echo.
  echo [X] The dev server stopped with an error. Scroll up for details.
)
pause
endlocal
