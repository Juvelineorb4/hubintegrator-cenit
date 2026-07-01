# Hub Integrator v0.2.0 — Repository Instructions

## Architecture invariants

- The production container host is Linux.
- `odbc-api` runs natively on a separate Windows host because the PHD ODBC driver is Windows-only.
- Never add `odbc-api` to Docker Compose.
- In production, Linux containers must reach the Windows bridge through `ODBC_API_URL` using an approved DNS name or IP address. Do not assume `localhost` or `host.docker.internal`.
- PostgreSQL, `app-backend`, `python-app`, `python-etl`, Redis, and future Grafana services run in Docker on Linux.
- The target environment has no internet access. Runtime deployment must not download packages or images.

## Data safety

- Never run `docker compose down -v`, delete volumes, truncate tables, reset the database, or remove partitions without explicit approval.
- Preserve PostgreSQL volume persistence.
- The `tag_value` table is partitioned and is created through project-controlled raw SQL. Do not add it to automated Drizzle migration generation.
- Use the project's approved schema workflow (`db:push` plus setup/partition scripts) unless a reviewed migration plan explicitly changes it.
- ETL changes must preserve per-tag watermarks, idempotency, batch isolation, bulk inserts, and recovery after failures.
- Timestamps crossing service boundaries must use an explicit timezone and a documented UTC contract.

## Change workflow

Before editing:
1. Inspect the relevant files and current contracts.
2. State assumptions and unresolved questions.
3. Identify affected services, environment variables, ports, data, and deployment steps.
4. Produce a small implementation plan with acceptance criteria.
5. Ask before destructive or contract-breaking changes.

During implementation:
- Make the smallest coherent change.
- Do not mix unrelated refactors with the requested change.
- Keep secrets out of source control and logs.
- Add or update tests for behavior changes.
- Update documentation when commands, variables, ports, APIs, or deployment behavior change.

After implementation, report:
- Files changed.
- Commands and tests actually executed.
- Results and remaining risks.
- Rollback procedure.
