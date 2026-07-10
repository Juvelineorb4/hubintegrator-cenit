# INSTALL - v030-python-app RC4 offline package

## Scope
This package upgrades only python-app to image tag `v030-python-app:rc4`.
It does not modify app-backend, PostgreSQL, or Redis.
No database migrations are required.

## Artifacts
- images/v030-python-app_rc4.tar
- compose/docker-compose.v030-rc4.yml
- checksums/SHA256SUMS.txt
- TEST.md
- ROLLBACK.md

## 1) Verify checksums
Run from package root:

```bash
sha256sum -c checksums/SHA256SUMS.txt
```

## 2) Load RC4 image
```bash
docker load -i images/v030-python-app_rc4.tar
```

## 3) Confirm tag
```bash
docker image ls v030-python-app:rc4
```

## 4) Validate compose resolution
```bash
docker compose -f docker-compose.yml -f /path/to/v030-python-app-rc4-offline/compose/docker-compose.v030-rc4.yml config
```

## 5) Recreate only python-app
```bash
docker compose -f docker-compose.yml -f /path/to/v030-python-app-rc4-offline/compose/docker-compose.v030-rc4.yml up -d --no-build --force-recreate python-app
```

## 6) Verify running image
```bash
docker inspect python_app --format '{{.Config.Image}}'
```

Expected: `v030-python-app:rc4`.

## Safety
- Do not run `db:push` or migrations.
- Do not run `docker compose down -v`.
- Do not modify data during validation.
