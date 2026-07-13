# HubIntegrator — Global Agent Instructions

## Project Overview

**HubIntegrator** is a PHD (Process Historian Data) integration platform. It ingests time-series data from industrial historians (e.g., OSIsoft PI), stores it in a partitioned PostgreSQL database, and exposes it through REST APIs.

## Architecture

```
v1/
├── docker-compose.yml      # Orchestrates Docker services
├── .env                    # Shared Docker environment variables
├── app-backend/            # Node.js REST API (Express + Drizzle + PostgreSQL) — Docker
├── python-app/             # Python service (FastAPI) — Docker
└── odbc-api/               # Node.js REST API (Express + ODBC) — Native Windows, NO Docker
```

## Services

### Docker services (managed by `docker-compose.yml`)

| Service      | Port | Technology              | Responsibility                                      |
|--------------|------|-------------------------|-----------------------------------------------------|
| postgres     | 5432 | PostgreSQL 16 Alpine    | Primary database                                    |
| app-backend  | 3000 | Node 20, Express 4, TS  | REST API, DB schemas, data ingestion                |
| python-app   | 8000 | Python 3.12, FastAPI    | Data processing / auxiliary service                 |

### Native Windows service (NOT in Docker)

| Service   | Port | Technology             | Responsibility                                  |
|-----------|------|------------------------|-------------------------------------------------|
| odbc-api  | 1234 | Node.js, Express, ODBC | PHD historian bridge via Windows ODBC driver    |

> **odbc-api** runs as a native Node.js process on Windows. It requires a local ODBC DSN configured in the Windows ODBC Data Source Administrator. Never add it to `docker-compose.yml` — the PHD ODBC driver is Windows-only and cannot run inside a Linux container.

## Environment Variables

### `v1/.env` (Docker Compose level)
| Variable          | Value       | Purpose                           |
|-------------------|-------------|-----------------------------------|
| POSTGRES_DB       | devdb       | Database name                     |
| POSTGRES_USER     | myuser      | DB superuser for Docker container |
| POSTGRES_PASSWORD | 123456789   | DB superuser password             |

### `v1/python-app/.env` (local dev)
| Variable                    | Value                      | Purpose                                                         |
|-----------------------------|----------------------------|-----------------------------------------------------------------|
| ODBC_API_URL                | http://localhost:1234      | Base URL of the odbc-api historian bridge (port from `app.js`)  |

> **Inside Docker:** set `ODBC_API_URL=http://host.docker.internal:1234` (already injected by `docker-compose.yml`). For local dev runs, use `localhost`.

### `v1/app-backend/.env` (local dev level)
| Variable     | Value                                              | Purpose                                  |
|--------------|----------------------------------------------------|------------------------------------------|
| DATABASE_URL | postgresql://myuser:123456789@localhost:5432/devdb | For local scripts (drizzle-kit, tsx)     |

> **Important:** Inside Docker containers, the host is `postgres` (service name), not `localhost`. The `docker-compose.yml` injects `DATABASE_URL` with `postgres:5432` for the running container.

## Docker Commands

Run all commands from the `v1/` directory.

```bash
# Start all services (detached)
docker compose up -d

# Stop all services (keep volumes)
docker compose down

# Full reset — stop and delete all volumes (database wiped)
docker compose down -v

# Check service status
docker compose ps

# View logs for a specific service
docker compose logs app-backend
docker compose logs python-app
docker compose logs postgres

# Rebuild images after Dockerfile changes
docker compose up -d --build
```

## Troubleshooting

### Container stuck in `Restarting` state
```bash
docker compose logs app-backend
```
Check the error in the logs and fix it before restarting.

### Build fails with snapshot / corrupted cache error
```bash
# Clear build cache and rebuild from scratch
docker builder prune -af
docker compose build --no-cache
docker compose up -d
```

### Full reset — wipe everything (⚠️ deletes the database)
```bash
docker compose down
docker system prune -af --volumes
docker compose up -d --build
```

## Critical Decisions

### `db:push` vs `db:migrate`
The `tag_value` table is partitioned by range and uses `bigserial`. Running `db:migrate` fails because Drizzle Kit cannot generate partitioned DDL and conflicts with existing bigserial sequences. **Always use `db:push` for development schema changes.** After a full reset (`down -v`), re-apply with:
```bash
cd app-backend
pnpm db:push
pnpm seed:demo
```

### `odbc-api` is never in Docker
The PHD ODBC driver requires Windows and a locally configured DSN. `odbc-api` runs as a native Node.js process on the Windows host at `http://localhost:1234` (port defined in `odbc-api/app.js`, overridable via `PORT` env var). From inside Docker containers it is reached via `http://host.docker.internal:1234`, which is what `docker-compose.yml` injects as `ODBC_API_URL` for `python-app`.

## Boundaries

- ✅ **Always:** Run `docker compose` commands from the `v1/` directory.
- ✅ **Always:** Use `db:push` for development schema changes — never `db:migrate`.
- ⚠️ **Ask first:** `docker compose down -v` — wipes the entire database.
- 🚫 **Never:** Add `odbc-api` to `docker-compose.yml`.
- 🚫 **Never:** Commit `.env` files with real credentials.

### Los datos se borraron al levantar el contenedor
Los datos solo se pierden con `docker compose down -v`. Verificar que el volumen existe:
```bash
docker volume ls
# Debe aparecer: v1_postgres_data
```

### `--build` vs sin `--build`
| Comando | Cuándo usarlo |
|---------|---------------|
| `docker compose up -d` | Solo apagar/encender sin cambios en Dockerfile o dependencias |
| `docker compose up -d --build` | Después de cambiar `Dockerfile`, `package.json`, o tras limpiar caché |

### Restaurar DB después de reset
```bash
pnpm db:push          # Crea tablas + tag_value particionada
pnpm seed:partitions  # Crea particiones mensuales
pnpm seed:demo        # Carga datos de prueba
```

## Despliegue en nodo sin internet

Docker y WSL2 deben estar instalados en el nodo destino. Las imágenes se exportan desde la máquina con internet y se cargan en el nodo offline.

### Paso 1 — En la máquina con internet

```powershell
# Construir las imágenes del proyecto
cd v1
docker compose build

# Bajar la imagen de postgres si no está aún
docker pull postgres:16-alpine

# Verificar que las 4 imágenes existen
docker images
# Deben aparecer: postgres:16-alpine, v1-app-backend, v1-python-app

# Exportar cada imagen a un archivo .tar
docker save postgres:16-alpine -o postgres-16-alpine.tar
docker save v1-app-backend     -o app-backend.tar
docker save v1-python-app      -o python-app.tar
```

> Los nombres `v1-app-backend` y `v1-python-app` los asigna Docker Compose según el nombre de la carpeta raíz. Verificar con `docker images` antes de exportar.

#### Qué llevar al nodo sin internet

```
pendrive/
  postgres-16-alpine.tar     ← imagen postgres
  app-backend.tar            ← imagen app-backend
  python-app.tar             ← imagen python-app
  v1/                        ← carpeta del proyecto completa
    docker-compose.yml
    .env                     ← ajustar credenciales para ese entorno
    app-backend/             ← sin node_modules (van dentro del contenedor)
    python-app/
```

> **No copiar `node_modules`** del host — las dependencias ya están dentro de las imágenes exportadas.

---

### Paso 2 — En el nodo sin internet

```powershell
# Cargar las imágenes desde los archivos .tar
docker load -i postgres-16-alpine.tar
docker load -i app-backend.tar
docker load -i python-app.tar

# Verificar que cargaron correctamente
docker images
```

Configurar `v1/.env` con los valores del entorno destino:

```env
POSTGRES_DB=devdb
POSTGRES_USER=myuser
POSTGRES_PASSWORD=123456789
```

```powershell
# Levantar los servicios (sin --build, usa las imágenes ya cargadas)
cd v1
docker compose up -d

# Verificar que todos los servicios están corriendo
docker compose ps
```

#### Primera vez — inicializar la base de datos

```powershell
docker compose exec app-backend pnpm db:push
docker compose exec app-backend pnpm seed:partitions
docker compose exec app-backend pnpm seed:demo    # opcional — datos de prueba
```

---

### Actualizar imágenes en el nodo sin internet

Primero identificar qué cambió para saber qué hacer:

| Qué cambió | ¿Reconstruir imagen? | ¿Recargar `.tar`? | ¿Reiniciar compose? |
|---|---|---|---|
| Código JS/Python (solo) | No (volumen montado) | No | No (hot reload activo) |
| `package.json` / `requirements.txt` | **Sí** | **Sí** | Sí |
| `Dockerfile` | **Sí** | **Sí** | Sí |
| `docker-compose.yml` (puertos, env, etc.) | No | No | **Sí** (`down` + `up -d`) |
| `.env` | No | No | **Sí** (`down` + `up -d`) |

#### Caso: cambio en dependencias o Dockerfile

```powershell
# En la máquina con internet — reconstruir solo el servicio cambiado
docker compose build app-backend   # o python-app

# Re-exportar solo esa imagen
docker save v1-app-backend -o app-backend.tar   # o python-app.tar

# En el nodo sin internet — cargar y reiniciar
docker load -i app-backend.tar
docker compose up -d --no-build
```

#### Caso: cambio en `docker-compose.yml` o `.env` (puertos, variables)

No requiere reconstruir ni recargar ninguna imagen. Solo copiar el archivo actualizado al nodo y reiniciar:

```powershell
docker compose down
docker compose up -d
```

---

## Boundaries

- **Never commit** `.env` files or secrets to version control.
- **Ask before** adding new services to `docker-compose.yml`.
- **Ask before** changing exposed ports or shared network configuration.
- Prefer `docker compose down -v` only when a full DB reset is intentional — data will be lost.
- **Never use `--build`** en el nodo sin internet — no tiene acceso a los registros de imágenes base.
