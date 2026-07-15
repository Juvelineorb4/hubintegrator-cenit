# ROLLBACK RC1

## Principle
Rollback only `app-backend` and `python-app` images.
Do not remove data volumes and do not downgrade migrations automatically.

## 1) Identify last stable images (example)
```bash
docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -E 'app-backend|python-app'
```

## 2) Set stable tags in override (or use a separate rollback override)
Example:
- `app-backend`: `<stable-backend-tag>`
- `python-app`: `<stable-python-tag>`

## 3) Apply rollback without build
```bash
docker compose -f docker-compose.yml -f compose/docker-compose.v040-rc1.yml up -d --no-build app-backend python-app
```

## 4) Validate health
```bash
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:8000/
```

## Safety
- Never run `docker compose down -v` during rollback.
- Keep RC1 images available until rollback is accepted.
