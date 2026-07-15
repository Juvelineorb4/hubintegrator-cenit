#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f .env ]]; then
  echo "Missing .env in package root." >&2
  exit 1
fi

docker compose --env-file .env -f compose/docker-compose.v040-standalone.yml ps