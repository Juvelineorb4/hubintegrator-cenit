# RC3 Standalone Validation

## Build-Side Validation Checklist
1. `docker compose --env-file .env -f compose/docker-compose.v040-standalone.yml config --services`
   - expected exactly:
     - postgres
     - redis
     - app-backend
     - python-app
2. `docker compose --env-file .env -f compose/docker-compose.v040-standalone.yml config --images`
   - expected exactly 4 images
3. Confirm no db-init text in Compose:
   - `grep -n "db-init" compose/docker-compose.v040-standalone.yml` should return no matches
4. Start infrastructure first:
   - `docker compose --env-file .env -f compose/docker-compose.v040-standalone.yml up -d postgres redis`
5. Run migration/check one-shot:
   - `bash scripts/migrate-v040.sh`
6. Start apps only after migration success:
   - `docker compose --env-file .env -f compose/docker-compose.v040-standalone.yml up -d --no-build app-backend python-app`
7. Health:
   - backend `/api/health` HTTP 200
   - python `/` HTTP 200
8. DB schema check:
   - exactly 6 business tables in schema `phd`
9. Validate user/database mapping:
   - `SELECT current_user, current_database();`
10. Stop/start persistence:
   - `bash scripts/stop-v040.sh`
   - `bash scripts/start-v040.sh`

## Required Backend Test Matrix
Run and record:
- type-check
- build
- phase2a
- phase2b
- phase2c
- phase2d
- phase2e
- phase3a
- phase3b
- phase5b
- phase5c

## Required Python Test Matrix
Run and record:
- `python -m unittest discover -s tests -p "test_*.py" -v`

## Isolation Validation
- RC3 volumes must be:
  - `hubv040rc3_postgres_data`
  - `hubv040rc3_redis_data`
- No RC2 volume reuse.
- No legacy volume deletion.
