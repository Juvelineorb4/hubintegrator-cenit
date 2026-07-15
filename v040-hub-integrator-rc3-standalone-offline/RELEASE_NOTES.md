# Hub Integrator v0.4.0 RC3 Standalone Offline

## Summary
RC3 provides a simplified standalone deployment with:
- exactly 4 images
- exactly 4 compose services
- one-shot migration command (no db-init service)

## Included Images
- v040-app-backend:rc3
- v040-python-app:rc3
- postgres:16-alpine
- redis:7-alpine

## Included Services
- postgres
- redis
- app-backend
- python-app

## Design Decisions
- `COMPOSE_PROJECT_NAME=hubv040rc3`
- exclusive RC3 volumes:
  - hubv040rc3_postgres_data
  - hubv040rc3_redis_data
- no python-etl in this package
- no db-init permanent service
- no `db:push`, no seed operations in package scripts

## Known Limitations
- `DATABASE_URL` is built from `POSTGRES_*` values, so `POSTGRES_PASSWORD` must be URL-safe.
- Final validation of live Windows ODBC browse requires network reachability in target environment.
- Host-level HTTP checks with some PowerShell clients may be flaky; in-container checks are used as deterministic fallback evidence.
