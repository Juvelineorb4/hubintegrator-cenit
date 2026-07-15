# Hub Integrator v0.4.0 RC2 Standalone Offline

## Scope
This package is autonomous from legacy v0.2/v0.3 stacks.
It uses project name `hubv040`, dedicated volumes, and dedicated host ports.

## Included Services
- postgres
- redis
- db-init
- app-backend
- python-app

## Requirements
- Docker Engine and Docker Compose plugin
- Linux host for containers
- Windows odbc-api reachable from Linux through approved DNS/IP in `ODBC_API_URL`

## Install Steps
1. Edit `config/.env.standalone` with target credentials, ports, and Windows bridge URL.
2. Make scripts executable on Linux:
   - `chmod +x scripts/*.sh`
3. Load images:
   - `bash scripts/load-images.sh`
4. Stop legacy runtime (optional but recommended to avoid port conflicts):
   - `bash scripts/stop-legacy.sh`
5. Start standalone stack:
   - `bash scripts/start-v040.sh`
6. Check status:
   - `bash scripts/status-v040.sh`

## Health Checks
- Backend: `GET http://<host>:${BACKEND_HOST_PORT}/api/health`
- Python app: `GET http://<host>:${PYTHON_HOST_PORT}/`

## Safety
- Do not run `docker compose down -v`.
- Do not prune volumes/images in production.
- Do not set `ODBC_API_URL` to localhost in Linux container deployments.
