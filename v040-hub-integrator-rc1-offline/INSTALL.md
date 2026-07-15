# Hub Integrator v0.4.0 RC1 Offline Install (Ubuntu node)

## Scope
- Installs only `v040-app-backend:rc1` and `v040-python-app:rc1`.
- Does not include `odbc-api`, `python-etl`, PostgreSQL image, or Redis image archives.
- Do not use internet on the target node.

## Prerequisites on node
- Docker and Docker Compose plugin installed.
- Existing project directory with base `docker-compose.yml` and persistent volumes already present.
- Existing `postgres` and `redis` images already available in the node image cache.

## 1) Verify checksums before load
```bash
cd v040-hub-integrator-rc1-offline
sha256sum -c checksums/SHA256SUMS.txt
```
Expected: all `OK`.

## 2) Load images
```bash
docker load -i images/v040-app-backend_rc1.tar
docker load -i images/v040-python-app_rc1.tar
```

## 3) Validate image tags
```bash
docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}' | grep -E 'v040-app-backend:rc1|v040-python-app:rc1'
```

## 4) Prepare environment
- Copy `config/.env.node.example` values into the node `.env` file used by Compose.
- Never commit or store real secrets in this package.

Minimum metadata configuration:
```env
PHD_METADATA_MODE=required
PHD_METADATA_CONCURRENCY=5
PHD_METADATA_MAX_TAGS=1000
ODBC_API_URL=http://IP_WINDOWS_ODBC:1234
ODBC_CONNECT_TIMEOUT_SECONDS=10
ODBC_READ_TIMEOUT_SECONDS=120
```

## 5) Validate resolved compose
```bash
docker compose -f docker-compose.yml -f compose/docker-compose.v040-rc1.yml config
```

## 6) Start without build
```bash
docker compose -f docker-compose.yml -f compose/docker-compose.v040-rc1.yml up -d --no-build
```

## 7) Quick health checks
```bash
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:8000/
docker compose -f docker-compose.yml -f compose/docker-compose.v040-rc1.yml ps
```

## Safety
- Do not run `docker compose down -v`.
- Do not delete previous image set until RC1 acceptance.
- Do not pull/build in the offline node.
