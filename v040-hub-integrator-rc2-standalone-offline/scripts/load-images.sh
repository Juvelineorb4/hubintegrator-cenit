#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGES_DIR="${ROOT_DIR}/images"

required=(
  "v040-app-backend_rc2.tar"
  "v040-python-app_rc2.tar"
  "postgres_16-alpine.tar"
  "redis_7-alpine.tar"
)

for file in "${required[@]}"; do
  if [[ ! -f "${IMAGES_DIR}/${file}" ]]; then
    echo "Missing image tar: ${IMAGES_DIR}/${file}" >&2
    exit 1
  fi
done

for file in "${required[@]}"; do
  echo "Loading ${file} ..."
  docker load -i "${IMAGES_DIR}/${file}"
done

echo "All standalone RC2 images loaded."