# INSTALL - v030-python-app RC5 offline package

## Scope
This package upgrades only python-app to image tag `v030-python-app:rc5`.
It does not modify app-backend, PostgreSQL, or Redis.
No migrations are required.

## Artifacts
- images/v030-python-app_rc5.tar
- compose/docker-compose.v030-rc5.yml
- compose/docker-compose.yml
- compose/docker-compose.prod.yml
- .env.example
- checksums/SHA256SUMS.txt
- TEST.md
- BACKUP.md
- ROLLBACK.md
- RELEASE_NOTES.md

## 1) Verify checksums
Run from package root:

```bash
sha256sum -c checksums/SHA256SUMS.txt
```

## 2) Back up before upgrade
Follow BACKUP.md and complete PostgreSQL and compose file backup.

## 3) Load RC5 image
```bash
docker load -i images/v030-python-app_rc5.tar
```

## 4) Confirm tag
```bash
docker image ls v030-python-app:rc5
```

## 5) Validate compose resolution
```bash
docker compose -f compose/docker-compose.yml -f compose/docker-compose.prod.yml -f compose/docker-compose.v030-rc5.yml config
```

## 6) Recreate only python-app
```bash
docker compose -f compose/docker-compose.yml -f compose/docker-compose.prod.yml -f compose/docker-compose.v030-rc5.yml up -d --no-build --force-recreate python-app
```

## 7) Verify running image
```bash
docker inspect python_app --format '{{.Config.Image}}'
```

Expected: `v030-python-app:rc5`.

## Safety rules
- Do not run build or pull on the offline server.
- Do not run `docker compose down -v`.
- Do not run migrations or data reset commands.
- Do not remove previous image set until release acceptance.
