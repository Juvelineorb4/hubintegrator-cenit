# TEST - v030-python-app RC3 validation

## Goal
Validate that python-app RC3 package behavior includes:
- Pressure via `/tags/interval`
- Flow + selector via `/tags/interval`
- Volume via tags RAW
- Correct parser behavior from `parser.py`

## Prerequisites
- `python-app` recreated with `v030-python-app:rc2`.
- Services up: postgres, app-backend, redis, python-app.
- Linux container can reach Windows odbc-api via `ODBC_API_URL`.

## A) Parser validation (corrected parser.py)
Use a known Excel input that previously failed and now must parse/load correctly.

1. Preview parse (no persistence):
```bash
curl -sS -X POST "http://localhost:8000/upload/preview" \
  -F "file=@/path/to/test-file.xlsx"
```

2. Load and process:
```bash
curl -sS -X POST "http://localhost:8000/upload/load" \
  -F "file=@/path/to/test-file.xlsx"
```

Expected: HTTP 200 and structured report without parser regression errors.

## B) Query tests with HISTORIAN_SOURCE=postgres
Set env and recreate only python-app:
```bash
export HISTORIAN_SOURCE=postgres
docker compose -f docker-compose.yml -f /path/to/v030-python-app-rc3-offline/compose/docker-compose.v030-test.yml up -d --no-build --force-recreate python-app
```

Run functional calls:
```bash
curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=SYS01&start=2026-07-01T00:00:00&end=2026-07-01T01:00:00&interval_seconds=60"
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=SYS01&start=2026-07-01T00:00:00&end=2026-07-01T01:00:00&interval_seconds=60"
curl -sS "http://localhost:8000/tag-values/volumeBySystem?system_code=SYS01&start=2026-07-01T00:00:00&end=2026-07-01T01:00:00"
```

Expected:
- Responses are HTTP 200.
- `pressureBySystem` and `flowBySystem` return interval-based data.
- `flowBySystem` returns `state_value` aligned by timestamp with last-known selector state.
- `volumeBySystem` returns change-points derived from RAW values.

## C) Query tests with HISTORIAN_SOURCE=odbc
Set env and recreate only python-app:
```bash
export HISTORIAN_SOURCE=odbc
export ODBC_API_URL=http://<windows-odbc-host>:1234
docker compose -f docker-compose.yml -f /path/to/v030-python-app-rc3-offline/compose/docker-compose.v030-test.yml up -d --no-build --force-recreate python-app
```

Re-run the same endpoints:
```bash
curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=SYS01&start=2026-07-01T00:00:00&end=2026-07-01T01:00:00&interval_seconds=60"
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=SYS01&start=2026-07-01T00:00:00&end=2026-07-01T01:00:00&interval_seconds=60"
curl -sS "http://localhost:8000/tag-values/volumeBySystem?system_code=SYS01&start=2026-07-01T00:00:00&end=2026-07-01T01:00:00"
```

Expected:
- Pressure and flow use `/tags/interval` through ODBC bridge.
- Volume uses RAW reads through ODBC bridge and preserves change-point behavior.

## Evidence to capture
- `docker compose ps`
- `docker inspect python_app --format '{{.Config.Image}}'`
- Raw JSON responses from the four checks above.
- Any error response body and timestamp.
