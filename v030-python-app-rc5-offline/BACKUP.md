# BACKUP - before RC5 upgrade

## 1) Back up compose and env files
```bash
mkdir -p backup-rc5
cp docker-compose.yml backup-rc5/docker-compose.yml
cp docker-compose.prod.yml backup-rc5/docker-compose.prod.yml
cp .env backup-rc5/.env
```

## 2) Back up PostgreSQL data (logical dump)
```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup-rc5/postgres-pre-rc5.sql
```

## 3) Optional: list running image versions
```bash
docker compose ps
docker inspect python_app --format '{{.Config.Image}}'
```

## Notes
- Keep this backup until RC5 is accepted.
- Do not stop services with volume deletion.
