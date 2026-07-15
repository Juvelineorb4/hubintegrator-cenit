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

DATABASE_URL_DERIVED="postgresql://${POSTGRES_USER_VAL}:${POSTGRES_PASSWORD_VAL}@postgres:5432/${POSTGRES_DB_VAL}"

compose=(
  env
  POSTGRES_DB="${POSTGRES_DB_VAL}"
  POSTGRES_USER="${POSTGRES_USER_VAL}"
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD_VAL}"
  docker compose --env-file .env -f compose/docker-compose.v040-standalone.yml
)

postgres_id="$(${compose[@]} ps -q postgres)"
if [[ -z "${postgres_id}" ]]; then
  echo "postgres is not running. Start postgres and redis first." >&2
  exit 1
fi

postgres_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${postgres_id}")"
if [[ "${postgres_health}" != "healthy" ]]; then
  echo "postgres is not healthy (current: ${postgres_health})." >&2
  exit 1
fi

if ! ${compose[@]} exec -T postgres sh -lc "PGPASSWORD='${POSTGRES_PASSWORD_VAL}' psql -h 127.0.0.1 -U '${POSTGRES_USER_VAL}' -d '${POSTGRES_DB_VAL}' -v ON_ERROR_STOP=1 -c \"SELECT current_user, current_database();\" >/dev/null"; then
  cat >&2 <<'EOF'
PostgreSQL user/database check failed against the running RC3 volume.
This usually means the existing hubv040rc3_postgres_data volume was initialized with different credentials.

Recovery options:
1) First deployment / disposable data:
   docker compose --env-file .env -f compose/docker-compose.v040-standalone.yml down --remove-orphans
   docker volume rm hubv040rc3_postgres_data hubv040rc3_redis_data
   ./scripts/start-v040.sh
2) Existing data to preserve:
   keep the original POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB values used when that volume was created.
EOF
  exit 1
fi

${compose[@]} run --rm --no-deps -e DATABASE_URL="${DATABASE_URL_DERIVED}" app-backend pnpm db:phd:migrate
${compose[@]} run --rm --no-deps -e DATABASE_URL="${DATABASE_URL_DERIVED}" app-backend pnpm db:phd:check

echo "Migration and schema check completed successfully."