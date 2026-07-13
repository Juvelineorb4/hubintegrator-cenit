# ROLLBACK - python-app RC5

Rollback target: `v030-python-app:rc3` only.

## 1) Ensure RC3 image exists
```bash
docker image ls v030-python-app:rc3
```

## 2) Create rollback override
```bash
cat > compose/docker-compose.rollback-rc3.yml <<'EOF'
services:
  python-app:
    image: v030-python-app:rc3
EOF
```

## 3) Recreate only python-app
```bash
docker compose -f compose/docker-compose.yml -f compose/docker-compose.prod.yml -f compose/docker-compose.rollback-rc3.yml up -d --no-build --force-recreate python-app
```

## 4) Verify rollback image
```bash
docker inspect python_app --format '{{.Config.Image}}'
```

Expected: `v030-python-app:rc3`.

## Safety
- Do not modify PostgreSQL, Redis, or app-backend.
- Do not run migrations.
- Do not run `docker compose down -v`.
- Do not delete volumes or data.
