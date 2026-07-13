# ROLLBACK - python-app RC4

Rollback target: `v030-python-app:rc3` only.

## 1) Ensure RC3 image exists
```bash
docker image ls v030-python-app:rc3
```

## 2) Repoint python-app image to RC3
Use your active override to set:
- `python-app.image: v030-python-app:rc3`

## 3) Recreate only python-app
```bash
docker compose -f docker-compose.yml up -d --no-build --force-recreate python-app
```

## 4) Verify rollback image
```bash
docker inspect python_app --format '{{.Config.Image}}'
```

Expected: `v030-python-app:rc3`.

## Safety
- Do not run `docker compose down -v`.
- Do not run migrations.
- Do not delete volumes or data.
- Do not modify PostgreSQL, Redis, or app-backend.
- Recreate only `python-app`.
