#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f checksums/SHA256SUMS.txt ]]; then
  echo "Missing checksums/SHA256SUMS.txt" >&2
  exit 1
fi

required_tars=(
  "images/v040-app-backend_rc3.tar"
  "images/v040-python-app_rc3.tar"
  "images/postgres_16-alpine.tar"
  "images/redis_7-alpine.tar"
)

mapfile -t existing_tars < <(find images -maxdepth 1 -type f -name '*.tar' | sort)
if [[ "${#existing_tars[@]}" -ne 4 ]]; then
  echo "Expected exactly 4 image tar files in images/, found ${#existing_tars[@]}" >&2
  exit 1
fi

for tar_file in "${required_tars[@]}"; do
  if [[ ! -f "${tar_file}" ]]; then
    echo "Missing required image tar: ${tar_file}" >&2
    exit 1
  fi
done

sha256sum -c checksums/SHA256SUMS.txt

for tar_file in "${required_tars[@]}"; do
  docker load -i "${tar_file}"
done

required_tags=(
  "v040-app-backend:rc3"
  "v040-python-app:rc3"
  "postgres:16-alpine"
  "redis:7-alpine"
)

for tag in "${required_tags[@]}"; do
  docker image inspect "${tag}" >/dev/null
  echo "Loaded tag verified: ${tag}"
done

echo "Image load completed with exactly 4 RC3 tar files."