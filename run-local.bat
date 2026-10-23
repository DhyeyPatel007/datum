@echo off
REM DATUM // 01 - local launcher (Windows)
REM Runs DATUM on THIS machine: no password, no hosting, your CPU.
cd /d "%~dp0"

REM Find a REAL Python 3. The Microsoft Store stub also answers to "python"
REM but prints no version, so verify the version string. Fall back to the
REM "py" launcher that python.org installs (works even when PATH is wrong).
set PYCMD=
python --version 2>nul | findstr /R "Python 3\." >nul && set PYCMD=python
if defined PYCMD goto havepy
py -3 --version 2>nul | findstr /R "Python 3\." >nul && set PYCMD=py -3
if defined PYCMD goto havepy
echo Real Python 3 was not found.
echo 1. Install it from https://www.python.org/downloads/  - tick "Add python.exe to PATH".
echo 2. If a Microsoft Store message appears, Windows has a fake python shortcut:
echo    Settings ^> Apps ^> Advanced app settings ^> App execution aliases
echo    Turn OFF "python.exe" and "python3.exe", then run this file again.
pause
exit /b 1
:havepy

if not exist "sqlmap\sqlmapapi.py" (
  echo First run: downloading the sqlmap engine into .\sqlmap ...
  where git >nul 2>nul
  if errorlevel 1 (
    echo Git is not installed. Get it from https://git-scm.com/download/win then run this file again.
    pause
    exit /b 1
  )
  git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git sqlmap
  if not exist "sqlmap\sqlmapapi.py" (
    echo Engine download failed - check your internet connection and run again.
    pause
    exit /b 1
  )
)

echo Starting DATUM at http://127.0.0.1:8420  (keep this window open; close it to stop)
start "" http://127.0.0.1:8420
%PYCMD% datum_server.py
pause
