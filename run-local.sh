#!/bin/bash
# DATUM // 01 — local launcher (macOS / Linux)
# Runs DATUM on THIS machine: no password, no hosting, your CPU.
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is not installed. Install it (https://www.python.org/downloads/) and run again."
  exit 1
fi

if [ ! -f "sqlmap/sqlmapapi.py" ]; then
  echo "First run: downloading the sqlmap engine into ./sqlmap ..."
  if ! command -v git >/dev/null 2>&1; then
    echo "Git is not installed. Install git and run again."
    exit 1
  fi
  git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git sqlmap || {
    echo "Engine download failed — check your internet connection and run again."
    exit 1
  }
fi

echo "Starting DATUM at http://127.0.0.1:8420  (Ctrl+C to stop)"
(python3 -c "import webbrowser; webbrowser.open('http://127.0.0.1:8420')" &) 2>/dev/null
python3 datum_server.py
