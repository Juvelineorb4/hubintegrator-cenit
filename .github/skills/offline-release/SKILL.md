---
name: offline-release
description: Prepare a reproducible Hub Integrator release for an on-premise Linux server without internet. Use for version packaging, image export/import, dependency preparation, checksums, installation, upgrade, or rollback.
argument-hint: "[version and target environment]"
disable-model-invocation: true
---

# Offline release workflow

## Build side with internet

1. Start from a clean Git commit and record the commit SHA.
2. Validate dependency lock files.
3. Build production images without development bind mounts or reload commands.
4. Tag every project image with the release version.
5. Pull and pin third-party images.
6. Run tests and `docker compose config`.
7. Export images with `docker save`.
8. Generate SHA-256 checksums for all artifacts.
9. Package:
   - production Compose files
   - `.env.example`, never real secrets
   - image archives
   - checksums
   - installation guide
   - backup and rollback guide
   - release notes

## Offline Linux side

1. Verify checksums before loading images.
2. Back up configuration and PostgreSQL before an upgrade.
3. Load images with `docker load`.
4. Confirm expected image tags.
5. Validate resolved Compose configuration.
6. Start with `docker compose up -d --no-build`.
7. Run health, API, database, Redis, ETL, and Windows ODBC connectivity checks.
8. Record evidence and actual versions.

## Safety rules

- Do not build or pull on the offline server.
- Do not include secrets in the release bundle.
- Do not remove the previous image set until the new release is accepted.
- Do not remove volumes during rollback.

## Required output

- Artifact manifest
- Exact commands
- Validation evidence
- Rollback commands
- Known limitations
