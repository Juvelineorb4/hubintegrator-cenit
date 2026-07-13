# python-app v0.3.0 RC1 Test Guide

## Goal
Validate the public FastAPI responses of `python-app` with the same parameters in both historian modes:
- `HISTORIAN_SOURCE=postgres`
- `HISTORIAN_SOURCE=odbc`

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
- `INTERVAL_SECONDS` for pressure and flow

Example shell variables:

```bash
export SYSTEM_CODE="<real_system_code>"
export START="2026-07-01T00:00:00-05:00"
export END="2026-07-01T01:00:00-05:00"
export INTERVAL_SECONDS=60
```

## 1) Test in postgres mode

```bash
export HISTORIAN_SOURCE=postgres
export ODBC_API_URL="http://<IP_O_DNS_WINDOWS>:1234"
export ODBC_CONNECT_TIMEOUT_SECONDS=10
export ODBC_READ_TIMEOUT_SECONDS=120

curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}&interval_seconds=${INTERVAL_SECONDS}" > pressure.postgres.json
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}&interval_seconds=${INTERVAL_SECONDS}" > flow.postgres.json
curl -sS "http://localhost:8000/tag-values/volumeBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}" > volume.postgres.json
```

## 2) Test in odbc mode

```bash
export HISTORIAN_SOURCE=odbc
export ODBC_API_URL="http://<IP_O_DNS_WINDOWS>:1234"
export ODBC_CONNECT_TIMEOUT_SECONDS=10
export ODBC_READ_TIMEOUT_SECONDS=120

curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}&interval_seconds=${INTERVAL_SECONDS}" > pressure.odbc.json
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}&interval_seconds=${INTERVAL_SECONDS}" > flow.odbc.json
curl -sS "http://localhost:8000/tag-values/volumeBySystem?system_code=${SYSTEM_CODE}&start=${START}&end=${END}" > volume.odbc.json
```

## 3) Compare the outputs
Check that the public contract is preserved:
- HTTP status code
- JSON top-level fields
- `total_tags`
- tag names
- points per tag
- timestamps
- values
- selector pairing in flow

Suggested quick checks:

```bash
jq '.total_tags' pressure.postgres.json pressure.odbc.json
jq '.total_tags' flow.postgres.json flow.odbc.json
jq '.total_tags' volume.postgres.json volume.odbc.json
```

For a deeper comparison, diff the JSON after normalizing formatting.

## 4) Acceptability rule
Differences in values are acceptable only if they are explained by the historization behavior of PostgreSQL vs PHD. Structure and public schema must remain the same.
