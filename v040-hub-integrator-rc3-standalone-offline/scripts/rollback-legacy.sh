#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f .env ]]; then
  echo "Missing .env in RC3 package root." >&2
  exit 1
fi

LEGACY_COMPOSE_DIR="${LEGACY_COMPOSE_DIR:-}"
LEGACY_PROJECT_NAME="${LEGACY_PROJECT_NAME:-}"
LEGACY_COMPOSE_FILES="${LEGACY_COMPOSE_FILES:-docker-compose.yml}"
LEGACY_APP_BACKEND_URL="${LEGACY_APP_BACKEND_URL:-http://127.0.0.1:3000/api/health}"
LEGACY_PYTHON_APP_URL="${LEGACY_PYTHON_APP_URL:-http://127.0.0.1:8000/}"

if [[ -z "${LEGACY_COMPOSE_DIR}" ]]; then
  echo "Set LEGACY_COMPOSE_DIR for rollback." >&2
  exit 1
fi

# Stop RC3 without deleting volumes.
docker compose --env-file .env -f compose/docker-compose.v040-standalone.yml down --remove-orphans

cd "${LEGACY_COMPOSE_DIR}"
compose_args=()
IFS=':' read -r -a compose_files_array <<< "${LEGACY_COMPOSE_FILES}"
for file in "${compose_files_array[@]}"; do
  compose_args+=( -f "${file}" )
done

project_args=()
if [[ -n "${LEGACY_PROJECT_NAME}" ]]; then
  project_args+=( -p "${LEGACY_PROJECT_NAME}" )
fi

docker compose "${project_args[@]}" "${compose_args[@]}" up -d --no-build

curl -fsS "${LEGACY_APP_BACKEND_URL}" >/dev/null
curl -fsS "${LEGACY_PYTHON_APP_URL}" >/dev/null

echo "Legacy rollback completed. RC3 volumes were preserved."