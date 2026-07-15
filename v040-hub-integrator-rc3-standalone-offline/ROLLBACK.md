# Rollback Guide

## Objective
Rollback from RC3 to legacy stack without deleting RC3 or legacy volumes.

## Steps
1. Stop RC3:
   - `bash scripts/stop-v040.sh`
2. Start legacy stack with explicit variables:
   - `LEGACY_COMPOSE_DIR=/path/to/legacy \
      LEGACY_PROJECT_NAME=<legacy_project> \
      LEGACY_COMPOSE_FILES=docker-compose.yml \
      LEGACY_APP_BACKEND_URL=http://127.0.0.1:3000/api/health \
      LEGACY_PYTHON_APP_URL=http://127.0.0.1:8000/ \
      bash scripts/rollback-legacy.sh`
3. Confirm legacy endpoints are healthy.

## Safety Constraints
- Never use `down -v` in rollback.
- Never prune images/volumes in rollback.
- Preserve all RC3 data volumes for forensic recovery.
