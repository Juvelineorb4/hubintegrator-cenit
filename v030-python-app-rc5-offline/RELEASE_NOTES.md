# RELEASE NOTES - v030 python-app RC5

## Summary
- Release target: python-app only.
- Historical source: ODBC-only via OdbcHistorianClient.
- postgres historical mode removed from python-app services and tests.

## Included image
- v030-python-app:rc5

## Validation on build side
- python-app unit test suite: green (0 failures).
- docker compose config: base and prod resolved successfully.

## Known limitations
- Offline server must already have Docker and compose plugin installed.
- ODBC bridge must be reachable from Linux host through ODBC_API_URL.
- This package does not include or modify app-backend, odbc-api, PostgreSQL schema, or Redis data.
