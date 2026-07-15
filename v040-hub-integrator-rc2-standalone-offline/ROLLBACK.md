# Rollback Procedure

## Goal
Stop RC2 standalone stack and recover legacy runtime without data-destructive actions.

## Steps
1. Stop RC2:
   - `bash scripts/stop-v040.sh`
2. Start legacy stack using approved compose/env:
   - `LEGACY_COMPOSE_FILE=/path/to/legacy/docker-compose.yml LEGACY_ENV_FILE=/path/to/legacy/.env bash scripts/rollback-legacy.sh`
3. Validate legacy health endpoints.

## Notes
- RC2 dedicated volumes remain intact unless explicitly removed.
- This rollback does not run `down -v` and does not prune Docker state.
