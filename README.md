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

`render.yaml` is included. It clones sqlmap at build time and starts the server in **hosted mode** (`DATUM_HOSTED=1`), which changes two things vs local mode:

1. The whole app sits behind HTTP Basic auth — set `DATUM_UI_PASSWORD` in the Render dashboard (username: `datum`). The operator is the only user, so any target they enter is accepted. Hosted mode **refuses to run any scan** if no password is set: an unauthenticated public scanner would be abused under your own account within hours.
2. The server binds `0.0.0.0:$PORT` (local mode stays `127.0.0.1`).

**Responsible use:** only scan systems you own or have explicit permission to test — the same rule sqlmap itself ships with. DATUM is a friendly front-end; it does not grant anyone rights over anyone else's systems.

## License

MIT (see `LICENSE`) for the DATUM code in this repo. The scan engine is [sqlmap](https://github.com/sqlmapproject/sqlmap) (GPLv2), cloned separately at install/deploy time — it is not part of this repository.

## Full Engine mode (complete sqlmap parity)

The three preset modes are shortcuts. **Full Engine** mode exposes the complete sqlmap surface the REST API supports — the same options the command-line tool takes:

- **Parameter locations:** URL query, POST data, and Cookie header.
- **Depth:** level 1–5, risk 1–3, per-letter technique picker (B/E/U/S/T/Q), threads, request delay, tamper scripts.
- **Actions after detection:** banner, current user, current database, is-DBA, users, password hashes, privileges, list databases, list tables, list columns, and **dump table rows** — all rendered in the report's Extracted Data section exactly as the engine returns them.

Verified end-to-end against the practice lab: detection → tables → columns → full dump of the `products` table (3 rows) through the UI.

The one honest exception: sqlmap's *interactive terminal* features (the live `--os-shell` prompt, `--os-pwn` reverse shells) are conversations with a terminal and don't map onto a request/response web API. Everything else — detection, fingerprinting, enumeration, extraction, file-read via the SQL query path — is the original engine, unmodified: DATUM never reimplements a single payload (368 payload tests, 85 tamper scripts, 32 DBMS backends are sqlmap's own).

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
