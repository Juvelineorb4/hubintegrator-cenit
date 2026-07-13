# TEST - v030-python-app RC4 validation (ODBC real)

## Goal
Validate python-app against real Windows odbc-api:
- FastAPI health
- pressureBySystem
- flowBySystem
- SELECTOR_S_E pairing by timestamp
- volumeBySystem
- short and >16 day windows
- interval_seconds 60, 3600, 86400

## Prerequisites
- python-app running with image `v030-python-app:rc4`
- ODBC_API_URL points to Windows odbc-api host
- app-backend, postgres, redis are up

Set runtime variables:

```bash
export ODBC_API_URL="http://<IP_O_DNS_WINDOWS>:1234"
export ODBC_CONNECT_TIMEOUT_SECONDS=10
export ODBC_READ_TIMEOUT_SECONDS=120
```

## 1) FastAPI health
```bash
curl -sS "http://localhost:8000/docs" >/dev/null && echo "DOCS_OK"
curl -sS "http://localhost:8000/openapi.json" >/dev/null && echo "OPENAPI_OK"
```

Expected:
- `DOCS_OK`
- `OPENAPI_OK`

## 2) pressureBySystem (short window)
```bash
curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-01T01:00:00-05:00&interval_seconds=60"
```

Expected:
- HTTP 200
- `tags` with pressure categories
- resampled data from ODBC interval

## 3) flowBySystem + SELECTOR_S_E timestamp pairing
```bash
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-01T01:00:00-05:00&interval_seconds=60"
```

Expected:
- HTTP 200
- selector fields present
- `state_value` paired by timestamp logic
- data from ODBC interval

Manual pairing check:
- For a sample flow point timestamp `T`, verify `state_value` corresponds to selector value at timestamp `T`.

## 4) volumeBySystem (RAW)
```bash
curl -sS "http://localhost:8000/tag-values/volumeBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-01T01:00:00-05:00"
```

Expected:
- HTTP 200
- change-point output
- source from ODBC raw tags endpoint

## 5) interval_seconds variants for pressure/flow
```bash
curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-02T00:00:00-05:00&interval_seconds=3600"
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-02T00:00:00-05:00&interval_seconds=3600"
curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-31T00:00:00-05:00&interval_seconds=86400"
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-31T00:00:00-05:00&interval_seconds=86400"
```

Expected:
- HTTP 200
- Non-empty results for valid tags

## 6) >16 days window checks
```bash
curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=<SYSTEM_CODE>&start=2026-06-01T00:00:00-05:00&end=2026-06-20T00:00:00-05:00&interval_seconds=3600"
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=<SYSTEM_CODE>&start=2026-06-01T00:00:00-05:00&end=2026-06-20T00:00:00-05:00&interval_seconds=3600"
curl -sS "http://localhost:8000/tag-values/volumeBySystem?system_code=<SYSTEM_CODE>&start=2026-06-01T00:00:00-05:00&end=2026-06-20T00:00:00-05:00"
```

Expected:
- HTTP 200
- No timeout
- Consistent timestamp ordering

## Evidence to capture
- `docker compose ps`
- `docker inspect python_app --format '{{.Config.Image}}'`
- raw JSON outputs for all calls above
