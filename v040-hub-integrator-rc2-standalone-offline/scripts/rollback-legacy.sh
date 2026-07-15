#!/usr/bin/env bash
set -euo pipefail

# Optional rollback helper. Set LEGACY_COMPOSE_FILE and LEGACY_ENV_FILE in shell.
if [[ -z "${LEGACY_COMPOSE_FILE:-}" ]]; then
  echo "LEGACY_COMPOSE_FILE is required for rollback." >&2
  exit 1
fi

if [[ -n "${LEGACY_ENV_FILE:-}" ]]; then
  docker compose -f "${LEGACY_COMPOSE_FILE}" --env-file "${LEGACY_ENV_FILE}" up -d
else
  docker compose -f "${LEGACY_COMPOSE_FILE}" up -d
fi

echo "Legacy stack rollback started (non-destructive)."