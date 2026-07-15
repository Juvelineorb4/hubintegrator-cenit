# MIGRATE v0.4.0 RC1

## Objective
Switch only `app-backend` and `python-app` to RC1 images preserving DB and volumes.

## 1) Backup before upgrade (required)
```bash
# configuration backup
cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d%H%M%S)
cp .env .env.bak.$(date +%Y%m%d%H%M%S)

# PostgreSQL logical backup (adapt container/service names if needed)
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup_pre_rc1.sql
```

## 2) Validate compose with RC1 override
```bash
docker compose -f docker-compose.yml -f compose/docker-compose.v040-rc1.yml config
```

## 3) Apply RC1 without build
```bash
docker compose -f docker-compose.yml -f compose/docker-compose.v040-rc1.yml up -d --no-build app-backend python-app
```

## 4) Post-upgrade checks
```bash
docker compose -f docker-compose.yml -f compose/docker-compose.v040-rc1.yml ps
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:8000/
```

## Notes
- Do not execute `db:push`, seeds, or destructive SQL for this migration.
- No automatic migration downgrade is provided.
