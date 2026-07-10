# python-app v0.3.0 RC2 Rollback Guide

## Goal
Rollback only `python-app` without touching volumes or data.

## Safety rules
- Do not run `docker compose down -v`.
- Do not remove PostgreSQL volumes.
- Do not modify `python-etl`, PostgreSQL, `app-backend`, or Redis.

## Option A: rollback to RC1
Load the previous RC1 image archive if needed:

```bash
docker load -i /path/to/v030-python-app_rc1.tar
```

Use a temporary override that points only python-app to RC1:

```bash
cat > /tmp/docker-compose.python-app.rc1.yml <<'EOF'
services:
  python-app:
    image: v030-python-app:rc1
EOF

docker compose -f docker-compose.yml -f /tmp/docker-compose.python-app.rc1.yml up -d --no-build python-app
```

## Option B: rollback to v0.2.0
Load the previous v0.2.0 image archive if needed:

```bash
docker load -i /path/to/v020-python-app_latest.tar
```

Use a temporary override that points only python-app to v0.2.0:

```bash
cat > /tmp/docker-compose.python-app.v020.yml <<'EOF'
services:
  python-app:
    image: v020-python-app:latest
EOF

docker compose -f docker-compose.yml -f /tmp/docker-compose.python-app.v020.yml up -d --no-build python-app
```

## Verify rollback

```bash
docker image ls v030-python-app:rc1
docker image ls v020-python-app:latest
docker compose ps python-app
```

## Notes
- Rollback is image-only and does not alter data.
- Keep RC2, RC1, and v0.2.0 image archives available until acceptance is complete.
