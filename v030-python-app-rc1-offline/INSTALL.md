# python-app v0.3.0 RC1 Offline Install

## Scope
This package only replaces `python-app` with `v030-python-app:rc1`.
It does not modify `python-etl`, PostgreSQL, `app-backend`, or Redis.

## Artifact layout
- `images/v030-python-app_rc1.tar`
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

## 2) Load the RC1 image

```bash
docker load -i images/v030-python-app_rc1.tar
```

## 3) Confirm the expected image tag exists

```bash
docker image ls v030-python-app:rc1
```

## 4) Validate the resolved Compose configuration
Use the existing project compose file plus this override file:

```bash
docker compose -f docker-compose.yml -f v030-python-app-rc1-offline/compose/docker-compose.v030-test.yml config
```

## 5) Start without rebuilding

```bash
docker compose -f docker-compose.yml -f v030-python-app-rc1-offline/compose/docker-compose.v030-test.yml up -d --no-build
```

## 6) Notes
- Set `HISTORIAN_SOURCE`, `ODBC_API_URL`, `ODBC_CONNECT_TIMEOUT_SECONDS`, and `ODBC_READ_TIMEOUT_SECONDS` in the shell or `.env` before testing.
- Do not run `db:push`, migrations, or any data-changing commands during RC1 validation.
- Keep the previous `v020-python-app:latest` image available until acceptance.
