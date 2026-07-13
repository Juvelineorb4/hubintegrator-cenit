# python-app v0.3.0 RC1 Rollback Guide

## Goal
Return only `python-app` to `v020-python-app:latest` without touching volumes or data.

## Safety rules
- Do not run `docker compose down -v`.
- Do not remove PostgreSQL volumes.
- Do not touch `python-etl`, `app-backend`, PostgreSQL, or Redis images.

## Rollback commands
Stop the current stack without deleting data:

```bash
docker compose -f docker-compose.yml -f v030-python-app-rc1-offline/compose/docker-compose.v030-test.yml down
```

Load the previous python-app image archive from the v0.2.0 release bundle:

```bash
docker load -i /path/to/v020-python-app_latest.tar
```

Start again using a temporary override that points python-app back to the previous tag:

```bash
cat > /tmp/docker-compose.python-app.rollback.yml <<'EOF'
services:
  python-app:
    image: v020-python-app:latest
EOF

docker compose -f docker-compose.yml -f /tmp/docker-compose.python-app.rollback.yml up -d --no-build
```

## Verify rollback

```bash
docker image ls v020-python-app:latest
docker compose -f docker-compose.yml -f /tmp/docker-compose.python-app.rollback.yml config
```

## Notes
- The rollback is image-only and does not alter data.
- Keep the RC1 tar archived until acceptance is complete.
