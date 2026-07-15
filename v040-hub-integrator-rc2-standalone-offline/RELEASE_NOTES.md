# Hub Integrator v0.4.0 RC2 Standalone Offline

## What is included
- Standalone compose project `hubv040`
- Offline image tarballs for:
  - `v040-app-backend:rc2`
  - `v040-python-app:rc2`
  - `postgres:16-alpine`
  - `redis:7-alpine`
- Startup/stop/status/log/rollback scripts
- Validation and install documentation

## Key Guarantees
- Autonomous from v0.2/v0.3 runtime naming and volumes
- No destructive commands in provided scripts
- db-init bootstrap included through `db:phd:push`

## Operational Notes
- Runtime host is Linux for containers.
- `odbc-api` remains native on Windows and is consumed via `ODBC_API_URL`.
- No internet downloads required at runtime after loading tar images.
