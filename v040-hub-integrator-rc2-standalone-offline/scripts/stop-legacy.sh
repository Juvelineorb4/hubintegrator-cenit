#!/usr/bin/env bash
set -euo pipefail

# Stops likely legacy stacks without removing volumes or images.
legacy_projects=("v020" "v030" "hubintegrator")
for project in "${legacy_projects[@]}"; do
  if docker compose -p "${project}" ps >/dev/null 2>&1; then
    echo "Stopping legacy project: ${project}"
    docker compose -p "${project}" down --remove-orphans || true
  fi
done

# Stop common legacy container names when present.
legacy_containers=("node_app_backend" "python_app" "postgres_db" "redis_cache")
for container in "${legacy_containers[@]}"; do
  if docker ps -a --format '{{.Names}}' | grep -Fxq "${container}"; then
    echo "Stopping legacy container: ${container}"
    docker stop "${container}" >/dev/null || true
  fi
done

echo "Legacy stop routine completed (non-destructive)."