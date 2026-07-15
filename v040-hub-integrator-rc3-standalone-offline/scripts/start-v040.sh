#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f .env ]]; then
  echo "Missing .env in package root. Copy config/.env.standalone.example to .env first." >&2
  exit 1
fi

if grep -Eq '^[[:space:]]*DATABASE_URL=' .env; then
  echo "Invalid .env: DATABASE_URL must not be defined in RC3. Use POSTGRES_* only." >&2
  exit 1
fi

read_env_var() {
  local key="$1"
  local value
  value="$(awk -F= -v k="${key}" '$1==k{print $2}' .env | tail -n 1 | tr -d '\r')"
  if [[ -z "${value}" ]]; then
    return 1
  fi
  printf '%s' "${value}"
}

POSTGRES_DB_VAL="$(read_env_var POSTGRES_DB)"
POSTGRES_USER_VAL="$(read_env_var POSTGRES_USER)"
POSTGRES_PASSWORD_VAL="$(read_env_var POSTGRES_PASSWORD)"

compose=(
  env
  POSTGRES_DB="${POSTGRES_DB_VAL}"
  POSTGRES_USER="${POSTGRES_USER_VAL}"
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD_VAL}"
  docker compose --env-file .env -f compose/docker-compose.v040-standalone.yml
)

POSTGRES_HOST_PORT_VAL="$(read_env_var POSTGRES_HOST_PORT || printf '5432')"
APP_BACKEND_HOST_PORT_VAL="$(read_env_var APP_BACKEND_HOST_PORT || printf '3000')"
PYTHON_APP_HOST_PORT_VAL="$(read_env_var PYTHON_APP_HOST_PORT || printf '8000')"

check_port_free() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :${port} )" | tail -n +2 | grep -q "."; then
      return 1
    fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -ltn 2>/dev/null | awk '{print $4}' | grep -E "[:.]${port}$" >/dev/null; then
      return 1
    fi
  fi
  return 0
}

wait_healthy() {
  local service="$1"
  local attempts=40
  local sleep_seconds=3
  local container_id
  local status

  while (( attempts > 0 )); do
    container_id="$(${compose[@]} ps -q "${service}")"
    if [[ -n "${container_id}" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}")"
      if [[ "${status}" == "healthy" ]]; then
        return 0
      fi
    fi
    sleep "${sleep_seconds}"
    attempts=$((attempts - 1))
  done

  echo "Service ${service} did not become healthy in time." >&2
  return 1
}

for port_value in "${POSTGRES_HOST_PORT_VAL}" "${APP_BACKEND_HOST_PORT_VAL}" "${PYTHON_APP_HOST_PORT_VAL}"; do
  if ! check_port_free "${port_value}"; then
    echo "Port ${port_value} is already in use." >&2
    exit 1
  fi
done

${compose[@]} up -d postgres redis
wait_healthy postgres
wait_healthy redis

if ! scripts/migrate-v040.sh; then
  echo "Migration failed. Leaving postgres and redis running for diagnostics." >&2
  ${compose[@]} logs --tail 200 postgres redis
  exit 1
fi

${compose[@]} up -d --no-build app-backend python-app
wait_healthy app-backend
wait_healthy python-app

${compose[@]} ps

curl -fsS "http://127.0.0.1:${APP_BACKEND_HOST_PORT_VAL}/api/health" >/dev/null
curl -fsS "http://127.0.0.1:${PYTHON_APP_HOST_PORT_VAL}/" >/dev/null

echo "RC3 standalone stack started and validated."