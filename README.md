# DATUM // 01 — Spec-Auditor

A simple, calibration-certificate UI over **sqlmap** (open source, GPLv2), built exactly to the Argon A–Z design spec (Swiss Metrology theme: Ice Silver `#DDE3E8`, Deep Aubergine `#3A0F34`, Marigold `#EAAA00`; Space Grotesk / Plus Jakarta Sans / JetBrains Mono; flat colours only).

## Run it (local only)

Requirements: Python 3, and the sqlmap clone at `~/workspace/reverse-engineering/sqlmap` (this folder's sibling project).

```bash
cd ~/workspace/datum
python3 datum_server.py
# open http://127.0.0.1:8420
```

The server auto-starts sqlmap's REST API (`sqlmapapi.py`, port 8775) on the first scan, with throwaway in-memory API credentials (this sqlmap build requires `--username/--password`). The browser never talks to the engine directly — the local server proxies it, because the engine sends no CORS headers.

## Hosting (Render, locked down)

`render.yaml` is included. It clones sqlmap at build time and starts the server in **hosted mode** (`DATUM_HOSTED=1`), which changes three things vs local mode:

1. The whole app sits behind HTTP Basic auth — set `DATUM_UI_PASSWORD` in the Render dashboard (username: `datum`). Hosted mode **refuses to run any scan** if no password is set.
2. Targets are restricted to the owner's own domains via `DATUM_ALLOWED_HOSTS` (default: krynex.in, auditify.krynex.in, dopadiary.vercel.app, gillnet-backend-recovery.onrender.com). Any other host gets a 403 before the engine is touched.
3. The server binds `0.0.0.0:$PORT` (local mode stays `127.0.0.1`).

Never host this without hosted mode: a public, unauthenticated SQL-injection scanner would be an abuse magnet and would get shut down — and rightly so.

## Practice lab (built in, localhost only)

- Vulnerable page: `http://127.0.0.1:8420/lab/item?id=1` (string-concatenated SQL, in-memory SQLite)
- Safe page: `http://127.0.0.1:8420/lab/safe-item?id=1` (parameterised twin)

Or use the "practice page" links on Screen 1. **Authorised targets only** — the authorisation gate on Screen 1 is enforced, and the confirmation timestamp is printed on every report.

## Modes → engine mapping (verified against sqlmap source)

| Mode | Flags |
|---|---|
| Quick Check | `--batch --level=1 --risk=1 --smart` |
| Confirm It | `--batch --level=2 --risk=1 --technique=BEU` |
| Deep | `--batch --level=3 --risk=2 --technique=BEUSTQ` |

## Verified end-to-end (2026-10-23)

- Real scan through the UI pipeline against the vulnerable lab → **INJECTABLE**, parameter `id`, techniques boolean-based blind + error-based + UNION query, DBMS **SQLite**, real evidence payload on the report.
- Safe lab page → empty result set → **NOT INJECTABLE** path (WAF detection is keyed to sqlmap's actual CRITICAL detection message, not its routine "checking if protected" line — that distinction is coded and commented in `index.html`).

## Known v1 simplifications

- The 5-stage ledger is inferred from keywords in the engine log stream; sqlmap does not emit native stage events, so a stage can complete in the UI shortly before/after the engine's own ordering.
- Verdicts cover the tested parameter(s) at the chosen depth only — the report says so in plain language.
- No enumeration/dump/takeover UI (by design; detection + fingerprint only).

Files: `index.html` (the whole frontend), `datum_server.py` (server + proxy + lab), `shoot.mjs` / `shoot2.mjs` (CDP screenshot drivers used for the preview images in `screenshots/`).
