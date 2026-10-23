@echo off
REM DATUM // 01 - local launcher (Windows)
REM Runs DATUM on THIS machine: no password, no hosting, your CPU.
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python 3 is not installed. Get it from https://www.python.org/downloads/
  echo IMPORTANT: tick "Add python.exe to PATH" during install, then run this file again.
  pause
  exit /b 1
)

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
python datum_server.py
pause
