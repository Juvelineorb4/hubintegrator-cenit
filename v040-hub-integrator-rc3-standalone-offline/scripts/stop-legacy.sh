#!/usr/bin/env bash
set -euo pipefail

LEGACY_COMPOSE_DIR="${LEGACY_COMPOSE_DIR:-}"
LEGACY_PROJECT_NAME="${LEGACY_PROJECT_NAME:-}"
LEGACY_COMPOSE_FILES="${LEGACY_COMPOSE_FILES:-docker-compose.yml}"

if [[ -z "${LEGACY_COMPOSE_DIR}" ]]; then
  echo "Set LEGACY_COMPOSE_DIR to legacy stack directory." >&2
  exit 1
fi

if [[ ! -d "${LEGACY_COMPOSE_DIR}" ]]; then
  echo "LEGACY_COMPOSE_DIR does not exist: ${LEGACY_COMPOSE_DIR}" >&2
  exit 1
fi

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

docker compose "${project_args[@]}" "${compose_args[@]}" down --remove-orphans

echo "Legacy stack stopped without deleting volumes or images."