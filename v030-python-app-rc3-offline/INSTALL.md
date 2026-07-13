# INSTALL - v030-python-app RC3 offline package

## Scope
This package upgrades only python-app to image tag `v030-python-app:rc2`.
No database migrations are required.
No volume deletion is allowed.

## Artifacts
- images/v030-python-app_rc2.tar
- compose/docker-compose.v030-test.yml
- checksums/SHA256SUMS.txt
- TEST.md
- ROLLBACK.md

## 1) Verify checksums (offline server)
Run from the package root:

```bash
sha256sum -c checksums/SHA256SUMS.txt
```

Expected result: all lines `OK`.

## 2) Load image (offline server)
```bash
docker load -i images/v030-python-app_rc2.tar
```

## 3) Confirm image tag is present
```bash
docker image ls v030-python-app:rc2
```

## 4) Validate effective Compose configuration
Run from your deployment directory where the base `docker-compose.yml` exists:

```bash
docker compose -f docker-compose.yml -f /path/to/v030-python-app-rc3-offline/compose/docker-compose.v030-test.yml config > /tmp/compose-v030-test.resolved.yml
```

## 5) Recreate only python-app (no build)
```bash
docker compose -f docker-compose.yml -f /path/to/v030-python-app-rc3-offline/compose/docker-compose.v030-test.yml up -d --no-build --force-recreate python-app
```

## 6) Verify running container uses rc2
```bash
docker compose ps python-app
docker inspect python_app --format '{{.Config.Image}}'
```

Expected image: `v030-python-app:rc2`.

## Safety
- Do not run `docker compose down -v`.
- Do not run `db:push`, `db:migrate`, or SQL migrations.
- Do not remove old images/volumes until validation is accepted.
