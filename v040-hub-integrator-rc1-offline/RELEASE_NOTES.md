# Hub Integrator v0.4.0 RC1 Offline Release Notes

## Release metadata
- Version: `v0.4.0-rc1`
- Branch: `feature/v0.4.0-database-redesign`
- Commit SHA baseline: `33e4cce69bf49a866ebb4b1e642dd1883502ca73`

## Included images
- `v040-app-backend:rc1`
- `v040-python-app:rc1`

## Excluded by scope
- `python-etl`
- `odbc-api`
- PostgreSQL image archive
- Redis image archive
- HISTORIAN_SOURCE and PostgreSQL historical fallback features
- Real Excel and any secrets

## Artifact manifest
- `images/v040-app-backend_rc1.tar`
- `images/v040-python-app_rc1.tar`
- `compose/docker-compose.v040-rc1.yml`
- `config/.env.node.example`
- `migrations/0000_tan_power_pack.sql`
- `migrations/0001_red_hawkeye.sql`
- `migrations/meta/*`
- `checksums/SHA256SUMS.txt`
- `INSTALL.md`
- `MIGRATE.md`
- `TEST.md`
- `TEST_PHD_METADATA.md`
- `ROLLBACK.md`
- `RELEASE_NOTES.md`

## Validation evidence (build side)
- app-backend: type-check + build + phase2a/2b/2c/2d/2e + phase3a/3b + phase5b/5c: PASS
- python-app unittest discover (`tests/test_*.py`): PASS (35 tests, 0 failures, 0 errors)
- compose config with RC1 override: PASS
- startup with RC1 images (`--no-build`) for app-backend and python-app: PASS

## Known limitations
- Real PHD connectivity and metadata quality depend on node-to-Windows bridge reliability.
- RC1 node validation intentionally stops at `dryRun=true`; no write-path validation included.
- No automatic migration downgrade path is provided.
