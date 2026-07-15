# Hub Integrator v0.4.0 RC3 Standalone Offline

## Package Scope
This package runs as a standalone stack with exactly 4 services:
- postgres
- redis
- app-backend
- python-app

No db-init service is defined in Compose.
Migrations are executed one-shot with `scripts/migrate-v040.sh`.

## Installation Steps
1. Verify ZIP checksum on build side handoff:
   - `sha256sum v040-hub-integrator-rc3-standalone-offline.zip`
2. Unzip package.
3. Verify artifact checksums:
   - `sha256sum -c checksums/SHA256SUMS.txt`
4. Copy environment template:
   - `cp config/.env.standalone.example .env`
5. Edit `.env`:
   - set a new URL-safe `POSTGRES_PASSWORD`
   - set valid `ODBC_API_URL`
6. Keep `PHD_METADATA_MODE=disabled` for initial smoke checks.
7. Make scripts executable:
   - `chmod +x scripts/*.sh`
8. Load images:
   - `bash scripts/load-images.sh`
9. Stop previous stack without deleting volumes:
   - `LEGACY_COMPOSE_DIR=/path/to/legacy LEGACY_PROJECT_NAME=<legacy_project> bash scripts/stop-legacy.sh`
10. Start RC3:
   - `bash scripts/start-v040.sh`
11. Confirm migration/check output is successful.
12. Confirm exactly four services are running:
   - `bash scripts/status-v040.sh`
13. Validate endpoints:
   - `curl -fsS http://127.0.0.1:${APP_BACKEND_HOST_PORT}/api/health`
   - `curl -fsS http://127.0.0.1:${PYTHON_APP_HOST_PORT}/`
14. Validate PHD browse path connectivity before enabling strict mode.
15. After validating browse, switch to `PHD_METADATA_MODE=required` if desired.
16. For Excel verification, execute imports only with `dryRun=true`.

## Important Notes
- `DATABASE_URL` is built inside Compose from `POSTGRES_*` variables.
- Do not add secrets to version control.
- Do not run `docker compose down -v` in production.
