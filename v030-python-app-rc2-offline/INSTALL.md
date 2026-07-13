# python-app v0.3.0 RC2 Offline Install

## Scope
This package replaces only `python-app` with `v030-python-app:rc2`.
It does not modify `python-etl`, PostgreSQL, `app-backend`, Redis, volumes, or existing data.

## Commit reference
- Source commit SHA: `9ea306c71962ffb4f4d2bf2416eb8cde3fc434a9`

## Artifact layout
- `images/v030-python-app_rc2.tar`
- `compose/docker-compose.v030-test.yml`
- `checksums/SHA256SUMS.txt`
- `INSTALL.md`
- `TEST.md`
- `ROLLBACK.md`

## 1) Verify checksums
Run from the package root:

```bash
sha256sum -c checksums/SHA256SUMS.txt
```

## 2) Load the RC2 image

```bash
docker load -i images/v030-python-app_rc2.tar
```

## 3) Confirm the expected image tag exists

```bash
docker image ls v030-python-app:rc2
```

## 4) Validate the resolved Compose configuration
Use the existing project compose file plus this override file:

```bash
docker compose -f docker-compose.yml -f v030-python-app-rc2-offline/compose/docker-compose.v030-test.yml config
```

## 5) Recreate only python-app

```bash
docker compose -f docker-compose.yml -f v030-python-app-rc2-offline/compose/docker-compose.v030-test.yml up -d --no-build python-app
```

## 6) Verify that RC2 is running

```bash
docker compose -f docker-compose.yml -f v030-python-app-rc2-offline/compose/docker-compose.v030-test.yml ps python-app
docker image ls v030-python-app:rc2
```

## 7) Required environment variables
Set these in the shell or `.env` before recreating python-app:

```bash
export HISTORIAN_SOURCE=postgres
export ODBC_API_URL="http://<IP_O_DNS_WINDOWS>:1234"
export ODBC_CONNECT_TIMEOUT_SECONDS=10
export ODBC_READ_TIMEOUT_SECONDS=120
```

## Notes
- Do not run `db:push`, `db:migrate`, SQL migrations, or data-changing commands.
- Do not run `docker compose down -v`.
- Keep `v030-python-app:rc1` and `v020-python-app:latest` available until RC2 is accepted.
