#!/usr/bin/env python3
"""
DATUM // 01 — local server.

- Serves the DATUM frontend (index.html) on http://127.0.0.1:8420
- Proxies scan orchestration to sqlmap's own REST API (127.0.0.1:8775),
  auto-starting the engine from the local sqlmap clone if it is not running.
  (The browser cannot call the sqlmap API directly: it sends no CORS headers.)
- Hosts a LOCAL-ONLY practice lab at /lab/item?id=1 — an intentionally
  vulnerable page (string-concatenated SQL against an in-memory SQLite db)
  so DATUM can be tested end-to-end without touching any third-party site.
  /lab/safe-item?id=1 is the parameterised twin, for the "not injectable" case.

Stdlib only. Localhost only. Authorised targets only.
"""
import base64
import json
import os
import secrets
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
SQLMAP_DIR = os.environ.get("SQLMAP_DIR") or os.path.expanduser("~/workspace/reverse-engineering/sqlmap")
if not os.path.isfile(os.path.join(SQLMAP_DIR, "sqlmapapi.py")) and os.path.isfile(os.path.join(HERE, "sqlmap", "sqlmapapi.py")):
    SQLMAP_DIR = os.path.join(HERE, "sqlmap")  # vendored clone inside the repo (hosted deploys)
ENGINE = "http://127.0.0.1:8775"
PORT = int(os.environ.get("PORT", "8420"))

# Hosted mode (DATUM_HOSTED=1): the app must never become a public scanner.
# - DATUM_UI_PASSWORD: HTTP Basic auth over the whole app (username: datum).
# - Target allowlist: only the owner's own domains may be scanned.
HOSTED = os.environ.get("DATUM_HOSTED") == "1"
UI_PASSWORD = os.environ.get("DATUM_UI_PASSWORD", "")
ALLOWED_HOSTS = [h.strip().lower() for h in os.environ.get(
    "DATUM_ALLOWED_HOSTS",
    "krynex.in,auditify.krynex.in,dopadiary.vercel.app,gillnet-backend-recovery.onrender.com,127.0.0.1,localhost",
).split(",") if h.strip()]

MODES = {
    "quick":   {"level": 1, "risk": 1, "technique": "BEU",   "smart": True},
    "confirm": {"level": 2, "risk": 1, "technique": "BEU"},
    "deep":    {"level": 3, "risk": 2, "technique": "BEUSTQ"},
}

_engine_proc = None
# This sqlmap build requires --username/--password for its REST API.
# Throwaway credentials are generated per server run, kept only in memory,
# and used only between this proxy and the localhost engine.
_API_USER = "datum"
_API_PASS = secrets.token_hex(16)
_AUTH = "Basic " + base64.b64encode(("%s:%s" % (_API_USER, _API_PASS)).encode()).decode()


def engine_up():
    s = socket.socket()
    s.settimeout(0.4)
    try:
        s.connect(("127.0.0.1", 8775))
        return True
    except OSError:
        return False
    finally:
        s.close()


def ensure_engine():
    global _engine_proc
    if engine_up():
        return True
    if not os.path.isfile(os.path.join(SQLMAP_DIR, "sqlmapapi.py")):
        return False
    _engine_proc = subprocess.Popen(
        [sys.executable, "sqlmapapi.py", "-s", "-H", "127.0.0.1", "-p", "8775",
         "--username", _API_USER, "--password", _API_PASS],
        cwd=SQLMAP_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        if engine_up():
            return True
        time.sleep(0.25)
    return False


def engine_call(path, payload=None):
    req = urllib.request.Request(
        ENGINE + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", "Authorization": _AUTH},
        method="POST" if payload is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


# ---------- local practice lab (intentionally vulnerable, localhost only) ----------
def lab_db():
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE products (id INTEGER, name TEXT, price INTEGER)")
    db.executemany("INSERT INTO products VALUES (?,?,?)",
                   [(1, "Calibration weights set", 4999),
                    (2, "Optical reticle plate", 7250),
                    (3, "Marigold indicator lamp", 899)])
    return db


def lab_page(handler, safe):
    qs = parse_qs(urlparse(handler.path).query)
    raw = (qs.get("id") or [""])[0]
    db = lab_db()
    try:
        if safe:
            rows = db.execute("SELECT id, name, price FROM products WHERE id = ?", (raw,)).fetchall()
        else:
            # INTENTIONALLY VULNERABLE — local practice fixture only.
            rows = db.execute("SELECT id, name, price FROM products WHERE id = " + raw).fetchall()
        body_rows = "".join("<tr><td>%s</td><td>%s</td><td>%s</td></tr>" % r for r in rows) or \
                    "<tr><td colspan='3'>No products found.</td></tr>"
        note = ""
    except Exception as ex:  # surface the DB error like a real misconfigured app
        body_rows = ""
        note = "<p>Database error: %s</p>" % ex
    html = ("<html><head><title>Datum Lab Catalogue</title></head><body>"
            "<h1>Datum Lab Catalogue</h1>" + note +
            "<table border='1'><tr><th>id</th><th>name</th><th>price</th></tr>" +
            body_rows + "</table></body></html>")
    data = html.encode()
    handler.send_response(200)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _ui_authorized(self):
        if not UI_PASSWORD:
            return True
        expected = "Basic " + base64.b64encode(("datum:%s" % UI_PASSWORD).encode()).decode()
        return self.headers.get("Authorization") == expected

    def _demand_ui_auth(self):
        if self._ui_authorized():
            return True
        body = b"DATUM is password-protected."
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="DATUM"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return False

    def _json(self, obj, code=200):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self._demand_ui_auth():
            return
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            with open(os.path.join(HERE, "index.html"), "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        elif path == "/lab/item":
            lab_page(self, safe=False)
        elif path == "/lab/safe-item":
            lab_page(self, safe=True)
        elif path == "/datum/health":
            self._json({"engine": engine_up()})
        elif path.startswith("/datum/scan/"):
            parts = path.strip("/").split("/")  # datum/scan/<id>/<action>
            if len(parts) == 4:
                try:
                    self._json(engine_call("/scan/%s/%s" % (parts[2], parts[3])))
                except Exception as ex:
                    self._json({"success": False, "message": str(ex)}, 502)
            else:
                self._json({"success": False, "message": "bad path"}, 404)
        else:
            self._json({"success": False, "message": "not found"}, 404)

    def do_POST(self):
        if not self._demand_ui_auth():
            return
        path = urlparse(self.path).path
        if path != "/datum/start":
            self._json({"success": False, "message": "not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            url = (body.get("url") or "").strip()
            mode = MODES.get(body.get("mode") or "confirm", MODES["confirm"])
            if not (url.startswith("http://") or url.startswith("https://")) or "?" not in url:
                self._json({"success": False, "message": "URL must start with http:// or https:// and contain a query parameter"}, 400)
                return
            if HOSTED:
                if not UI_PASSWORD:
                    self._json({"success": False, "message": "Hosted mode requires DATUM_UI_PASSWORD to be set"}, 500)
                    return
                host = (urlparse(url).hostname or "").lower()
                if not any(host == a or host.endswith("." + a) for a in ALLOWED_HOSTS):
                    self._json({"success": False, "message": "Hosted DATUM only scans the owner's own domains (allowlist). '%s' is not on it." % host}, 403)
                    return
            if not ensure_engine():
                self._json({"success": False, "message": "sqlmap engine could not be started (clone missing at %s)" % SQLMAP_DIR}, 502)
                return
            task = engine_call("/task/new")
            taskid = task.get("taskid")
            options = {"url": url, "batch": True, "flushSession": True}
            options.update(mode)
            # sqlmap does not read proxy env vars itself. On networks whose only
            # egress is a proxy (e.g. this VM), direct TLS to outside targets is
            # cut — so forward the environment's proxy for non-local targets.
            # The value is never logged or returned (it can contain credentials).
            proxy = os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY") or \
                    os.environ.get("http_proxy") or os.environ.get("HTTP_PROXY")
            host = (urlparse(url).hostname or "").lower()
            if proxy and host not in ("127.0.0.1", "localhost", "::1"):
                options["proxy"] = proxy
            started = engine_call("/scan/%s/start" % taskid, options)
            if not started.get("success"):
                self._json({"success": False, "message": started.get("message", "engine refused the scan")}, 502)
                return
            self._json({"success": True, "taskid": taskid})
        except Exception as ex:
            self._json({"success": False, "message": str(ex)}, 502)


if __name__ == "__main__":
    bind = "0.0.0.0" if HOSTED else "127.0.0.1"
    print("DATUM // 01 at http://%s:%d  hosted=%s (lab: /lab/item?id=1 , /lab/safe-item?id=1)" % (bind, PORT, HOSTED))
    ThreadingHTTPServer((bind, PORT), Handler).serve_forever()
