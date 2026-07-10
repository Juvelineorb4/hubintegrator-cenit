# python-app v0.3.0 RC2 Test Guide

## Goal
Validate the RC2 image against the real Windows `odbc-api` using the same parameters in both historian modes:
- `HISTORIAN_SOURCE=postgres`
- `HISTORIAN_SOURCE=odbc`

The RC2 image includes:
- pressure via `/tags/interval`
- flow and selector via `/tags/interval`
- volume via `/tags`
- the parser fix in `python-app/app/services/parser.py`

## Shared parameters
Choose one real `system_code` that has:
- pressure tags
- flow tags
- `SELECTOR_S_E`
- volume tags

Reuse exactly the same values in both modes:
- `SYSTEM_CODE`
- `START`
- `END`
- `INTERVAL_SECONDS`

Example:

```bash
export SYSTEM_CODE="<real_system_code>"
export START="2026-07-01T00:00:00-05:00"
export END="2026-07-01T01:00:00-05:00"
export INTERVAL_SECONDS=60
export ODBC_API_URL="http://<IP_O_DNS_WINDOWS>:1234"
export ODBC_CONNECT_TIMEOUT_SECONDS=10
export ODBC_READ_TIMEOUT_SECONDS=120
```

## 1) Validate the parser.py fix
Use the same file that previously exposed the parser issue.
Upload it to the RC2 service and confirm the corrected processing result:

```bash
curl -sS -X POST "http://localhost:8000/upload/excel" \
  -F "file=@/path/to/corrected-parser-case.xlsx"
```

Review the response and confirm the parser behavior is now correct for that file.
Record the request file name and the returned warnings/data counts.

## 2) Test in postgres mode

```bash
export HISTORIAN_SOURCE=postgres

curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}&interval_seconds=${INTERVAL_SECONDS}" > pressure.postgres.json
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}&interval_seconds=${INTERVAL_SECONDS}" > flow.postgres.json
curl -sS "http://localhost:8000/tag-values/volumeBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}" > volume.postgres.json
```

## 3) Test in odbc mode

```bash
export HISTORIAN_SOURCE=odbc

curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}&interval_seconds=${INTERVAL_SECONDS}" > pressure.odbc.json
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}&interval_seconds=${INTERVAL_SECONDS}" > flow.odbc.json
curl -sS "http://localhost:8000/tag-values/volumeBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}" > volume.odbc.json
```

## 4) Compare the outputs
Check:
- HTTP status code
- JSON top-level fields
- `total_tags`
- tag names
- points per tag
- timestamps
- values
- selector pairing in flow

Quick checks:

```bash
jq '.total_tags' pressure.postgres.json pressure.odbc.json
jq '.total_tags' flow.postgres.json flow.odbc.json
jq '.total_tags' volume.postgres.json volume.odbc.json
```

For a deeper comparison, diff normalized JSON outputs.

## 5) Acceptance rule
Differences in values are acceptable only if they are explained by the historization behavior of PostgreSQL vs PHD. The public schema must remain unchanged.
