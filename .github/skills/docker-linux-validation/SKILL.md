---
name: docker-linux-validation
description: Review or prepare Docker Compose and Dockerfiles for the Hub Integrator Linux deployment. Use for Linux migration, Compose changes, Dockerfile changes, networking, volumes, health checks, or production hardening.
argument-hint: "[compose or Docker change to validate]"
disable-model-invocation: true
---

# Docker Linux validation

## Architecture check

- Confirm `odbc-api` remains outside Docker on Windows.
- Confirm production `ODBC_API_URL` points to the approved Windows DNS name or IP, not `localhost`.
- Treat `host.docker.internal` as a development-specific mechanism only when explicitly configured and justified.
- Confirm all container-to-container calls use Compose service names.
- Confirm the Windows-to-Linux firewall direction and required ports are documented.

## Compose validation

1. Run `docker compose config` before suggesting startup.
2. Separate development behavior from production behavior:
   - development may use bind mounts and reload
   - production must not use source bind mounts or `--reload`
3. Verify dependency health checks rather than startup order alone.
4. Verify named volumes for persistent data.
5. Do not publish PostgreSQL or Redis ports unless an external consumer requires them.
6. Avoid fixed `container_name` unless an operational requirement exists.
7. Pin image versions and record locally built image tags.
8. Use restart policies intentionally.
9. Check resource limits, logging, and graceful shutdown requirements.
10. Never recommend `docker compose down -v` as routine troubleshooting.

## Dockerfile validation

- Use reproducible dependency files.
- Use production commands without file watchers.
- Keep build-time internet requirements separate from offline runtime deployment.
- Prefer small, maintained base images compatible with required native libraries.
- Add health checks at Compose level when practical.
- Do not copy secrets into images.

## Required output

- Blocking findings
- Recommended changes
- Validation commands
- Production-readiness status
- Rollback notes
