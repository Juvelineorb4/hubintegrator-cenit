#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

docker compose \
  --project-directory "${ROOT_DIR}" \
  --env-file "${ROOT_DIR}/config/.env.standalone" \
  -f "${ROOT_DIR}/compose/docker-compose.v040-standalone.yml" \
  ps
