# TEST - v030-python-app RC5 offline validation

## Prerequisites
- RC5 deployed with compose override.
- ODBC_API_URL points to Windows odbc-api.
- app-backend, postgres, redis running.

## 1) Health
```bash
curl -sS "http://localhost:8000/docs" >/dev/null && echo DOCS_OK
curl -sS "http://localhost:8000/openapi.json" >/dev/null && echo OPENAPI_OK
```

## 2) pressureBySystem (60, 3600, 86400)
```bash
curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-01T01:00:00-05:00&interval_seconds=60"
curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-02T00:00:00-05:00&interval_seconds=3600"
curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-31T00:00:00-05:00&interval_seconds=86400"
```

## 3) flowBySystem with SELECTOR_S_E timestamp pairing
```bash
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-01T01:00:00-05:00&interval_seconds=60"
```
Check that each flow point uses selector value at the same timestamp.

## 4) volumeBySystem RAW
```bash
curl -sS "http://localhost:8000/tag-values/volumeBySystem?system_code=<SYSTEM_CODE>&start=2026-07-01T00:00:00-05:00&end=2026-07-01T01:00:00-05:00"
```

## 5) Long window (>16 days)
```bash
curl -sS "http://localhost:8000/tag-values/pressureBySystem?system_code=<SYSTEM_CODE>&start=2026-06-01T00:00:00-05:00&end=2026-06-20T00:00:00-05:00&interval_seconds=3600"
curl -sS "http://localhost:8000/tag-values/flowBySystem?system_code=<SYSTEM_CODE>&start=2026-06-01T00:00:00-05:00&end=2026-06-20T00:00:00-05:00&interval_seconds=3600"
curl -sS "http://localhost:8000/tag-values/volumeBySystem?system_code=<SYSTEM_CODE>&start=2026-06-01T00:00:00-05:00&end=2026-06-20T00:00:00-05:00"
```

## 6) Platform checks
```bash
docker compose ps
docker inspect python_app --format '{{.Config.Image}}'
```
Expected: `v030-python-app:rc5`.
