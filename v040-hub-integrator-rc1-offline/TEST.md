# TEST Plan (Offline Node)

## Goal
Validate RC1 deployment behavior without writing catalog data.

## 1) Service checks
```bash
docker compose -f docker-compose.yml -f compose/docker-compose.v040-rc1.yml ps
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:8000/
```

## 2) ODBC bridge connectivity (manual pre-check)
- Ensure Windows `odbc-api` is reachable from Ubuntu node at `ODBC_API_URL`.

## 3) Execute metadata validation flow
- Follow `TEST_PHD_METADATA.md` exactly.

## Hard stop for RC1 validation
- Do not run `POST /api/phd/import?dryRun=false`.
- Do not modify volumes.
- Do not run any seed/reset command.
