#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_ARGS=(
  --project-directory "${ROOT_DIR}"
  --env-file "${ROOT_DIR}/config/.env.standalone"
  -f "${ROOT_DIR}/compose/docker-compose.v040-standalone.yml"
)

# Start infrastructure first.
docker compose "${COMPOSE_ARGS[@]}" up -d postgres redis

# Run db init once and enforce success.
docker compose "${COMPOSE_ARGS[@]}" up db-init

# Start APIs after successful db-init.
docker compose "${COMPOSE_ARGS[@]}" up -d app-backend python-app

docker compose "${COMPOSE_ARGS[@]}" ps

echo "RC2 standalone stack is up."