# Standalone Validation Guide (RC2)

## Preconditions
- Images loaded from `images/*.tar`
- `config/.env.standalone` configured

## Validation Sequence
1. `bash scripts/start-v040.sh`
2. `bash scripts/status-v040.sh`
3. Confirm `db-init` completed successfully:
   - `docker compose --project-directory . --env-file config/.env.standalone -f compose/docker-compose.v040-standalone.yml ps`
   - `docker compose --project-directory . --env-file config/.env.standalone -f compose/docker-compose.v040-standalone.yml logs db-init`
4. Verify endpoints:
   - `curl http://localhost:${BACKEND_HOST_PORT}/api/health`
   - `curl http://localhost:${PYTHON_HOST_PORT}/`
5. Verify dedicated volumes exist:
   - `docker volume ls | grep hubv040_`
6. Persistence check:
   - `bash scripts/stop-v040.sh`
   - `bash scripts/start-v040.sh`
   - Re-check endpoints and existing volumes.

## Expected Results
- postgres, redis, app-backend, python-app: `Up`
- db-init: `Exited (0)`
- both health endpoints return HTTP 200
- `hubv040_postgres_data` and `hubv040_redis_data` persist after restart
