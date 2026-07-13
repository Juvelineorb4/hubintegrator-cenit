# ROLLBACK - python-app only

## Safety rules
- Do not run `docker compose down -v`.
- Do not remove PostgreSQL volumes.
- Do not run schema migrations during rollback.

## Option 1 (preferred): roll back to `v030-python-app:rc1`
1. Ensure image exists:
```bash
docker image ls v030-python-app:rc1
```

2. Override python-app image to rc1 (temporary command-line override file or edit dedicated rollback override).

3. Recreate only python-app:
```bash
docker compose -f docker-compose.yml up -d --no-build --force-recreate python-app
```

4. Confirm:
```bash
docker inspect python_app --format '{{.Config.Image}}'
```

Expected: `v030-python-app:rc1`.

## Option 2 (alternative): roll back to `v020-python-app:latest`
1. Ensure image exists:
```bash
docker image ls v020-python-app:latest
```

2. Set python-app image to `v020-python-app:latest` in your active override.

3. Recreate only python-app:
```bash
docker compose -f docker-compose.yml up -d --no-build --force-recreate python-app
```

4. Confirm:
```bash
docker inspect python_app --format '{{.Config.Image}}'
```

Expected: `v020-python-app:latest`.

## Post-rollback checks
```bash
docker compose ps python-app
curl -sS http://localhost:8000/
```

The root endpoint should return status ok.
