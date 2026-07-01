# odbc-api — Agent Instructions

## Overview

Node.js REST API that bridges the PHD (Process Historian Data) ODBC driver to HTTP.
Runs as a **native Windows process** — never inside Docker. The PHD ODBC driver is Windows-only and cannot run in a Linux container.

## Stack

| Technology | Version | Purpose                                      |
|------------|---------|----------------------------------------------|
| Node.js    | 20+     | Runtime                                      |
| Express    | 4       | REST API framework                           |
| odbc       | latest  | ODBC driver binding for PHD historian bridge |

## Development Commands

```bash
# Install dependencies
npm install

# Start with local JSON file source (no ODBC needed — for testing)
node server-with-local.js

# Start with PHD ODBC source (requires ODBC DSN configured in Windows)
node server-with-odbc.js
```

> Requires `.env` with `ODBC_CONNECTION_STRING` pointing to the configured PHD DSN in the Windows ODBC Data Source Administrator.

## Project Structure

```
odbc-api/
├── app.js                         # Express app factory — composition point only
├── server-with-local.js           # Start with local JSON file source
├── server-with-odbc.js            # Start with PHD ODBC source (production)
├── utils.js                       # Shared utilities (toPHDDateTime)
├── tags.json                      # Local data source for tag value queries (testing)
├── tags_browse.json               # Local data source for browse queries (testing)
├── controllers/tags.js            # HTTP layer — receives req/res, calls model
├── middlewares/cors.js            # CORS middleware
├── models/
│   ├── local-file-system/tags.js  # File-based model — reads tags.json + tags_browse.json
│   └── odbc/tags.js               # ODBC-based model (production)
└── routes/tags.js                 # Mounts routes to controllers
```

## REST API Endpoints

Base URL: `http://localhost:1234`

| Method | Path                    | Description                                         |
|--------|-------------------------|-----------------------------------------------------|
| GET    | /tags                   | Query values for multiple tags in a time range (`?tagnames=T1,T2&start=...&end=...`) |
| GET    | /tags/:tagname/browse   | Get PHD metadata for a single tag (used by loader)  |
| GET    | /tags/:tagname          | Query values for a single tag in a time range (`?start=...&end=...`) |

### `/tags/:tagname/browse` response shape

```json
[{
  "tagno": 37702,
  "units": "BPH",
  "data_type_name": "Float",
  "asset_name": "l_galpoz",
  "description": "Tag description from PHD"
}]
```

> `tagno` is a number in PHD. `units` can be `null`. `data_type_name` values: `Float`, `Integer`, `Double`, `String`, `Boolean`, `Binary`.

### `/tags/values` — `getByTags` flow (ODBC model)

Fetches time-series values for multiple tags in a single call. Handles heterogeneous data types automatically — PHD ODBC does not have a generic usable `value` column; the correct subtype must be specified per query.

**Flow:**

1. **Browse** — one `phd_tag_browse` query per tag (in parallel via `Promise.all`) to resolve `DATA_TYPE_NAME`
2. **Group** — tags grouped by value subtype:

   | `DATA_TYPE_NAME` | Subtype used |
   |---|---|
   | `FLOAT`, `DOUBLE` | `value.float` |
   | `INTEGER` | `value.integer` |
   | `STRING` | `value.string` |
   | everything else | `value.float` (fallback) |

3. **Query** — one `phd_data` query per group (in parallel via `Promise.all`), SQL on a single line:
   ```
   SELECT timestamp, tagname, value.float, data_type_name, CONFIDENCE FROM phd_data WHERE tagname IN (...) AND start_timestamp='...' AND end_timestamp='...' AND raw_data='TRUE'
   ```
4. **Merge** — all group results flattened into a single array

**PHD ODBC column naming:** PHD always returns column names in **UPPERCASE** regardless of how they are written in the SQL. Always use `row.TAGNAME`, `row.DATA_TYPE_NAME`, `row.TIMESTAMP`, `row.CONFIDENCE`, etc.

**ODBC SQL constraint:** PHD ODBC only supports basic SQL. The entire SQL string must be on a **single line** — multi-line template literals cause parse errors. No subqueries, no JOINs, no CTEs.

## Key Utilities (`utils.js`)

### `toPHDDateTime(dateTimeStr)`
Converts a datetime string to PHD format `DD-MMM-YYYY HH:mm:ss`.

**Bypass rule:** If the string starts with `NOW` (case-insensitive), it is returned unchanged — supports PHD relative timestamps: `NOW`, `NOW-1h`, `NOW-30m`.

## Architecture

Pattern: `route → controller → model → data source`

DI pattern: the server file selects a `TagModel` and passes it to `createApp({ tagModel })`.
- `app.js` is a pure composition point — no business logic.
- Data access changes belong in `models/`.
- HTTP changes belong in `routes/` and `controllers/`.

## Boundaries

- ✅ **Always:** Keep `app.js` as a pure composition point — no business logic.
- ⚠️ **Ask first:** Adding new ODBC queries or new model methods.
- 🚫 **Never:** Add to `docker-compose.yml` — PHD ODBC driver is Windows-only.
- 🚫 **Never:** Hardcode connection strings — use `.env`.

Current visible endpoint:
- `GET /tags`

---

## Data sources

### `local-file-system`
- implementation in `models/local-file-system/tags.js`
- reads `tags.json`
- useful for local testing or working without the external dependency

### `odbc`
- implementation in `models/odbc/tags.js`
- uses environment variables and the `odbc` package
- useful for querying the real data source

Important rule:
- both sources must keep the same public interface expected by the controller, for example `getAll()`

---

## Development rules

### Adding endpoints
1. create or extend the route in `routes/`
2. add the controller method
3. add or extend the matching model method
4. if the endpoint must work in both modes, reflect it in `local-file-system` and `odbc`

### Modifying existing logic
- do not put SQL or file reading in controllers
- do not put business rules in `app.js`
- do not access the data source directly from `routes/`
- change the minimum layer required

### Working with models
- keep signatures consistent across both implementations
- encapsulate file, query, and connection details inside the model
- if you add a new method, check whether it should also exist in the other data source

### Minimal good practices
- use `async/await` consistently
- return JSON from controllers
- keep names aligned by resource
- avoid large cross-layer changes if the adjustment belongs to a single layer

---

## Guide for AI agents

Before changing anything:
1. identify whether the change belongs to HTTP, business logic, or data access
2. verify whether it affects local mode, ODBC mode, or both
3. modify only the correct layer

Quick map:
- new endpoint: `routes/` + `controllers/` + `models/`
- HTTP response change: `controllers/`
- query or file reading change: `models/`
- middleware change: `middlewares/` or `app.js`
- local dataset change: `tags.json`
- manual connectivity test: `test-connection.js` or `test-query.js`

To avoid breaking the architecture:
- do not import ODBC in `controllers/` or `routes/`
- do not read `tags.json` outside `models/` or utilities
- do not couple `app.js` to a concrete data source
- do not assume there is only one model implementation
- if you add a method to the model, review the other implementation

If something is not clearly connected to the current flow:
- do not remove it without verifying actual usage
- treat it as support or leftover code until confirmed

---

## Assertions

- The project follows a lightweight MVC approach, not a strict domain separation.
- `TagModel` acts as an implicit contract between the controller and the data source.
- `schemas/` exists for future validations because it does not currently participate in the visible flow.
- `web/` and `api.http` are used as support or manual testing artifacts, not as a core part of the current `tags` flow.
- API behavior should remain equivalent between local mode and ODBC mode when the same endpoint exists.

---

## Referencia PHD ODBC — Tablas y columnas

Fuente: *Uniformance PHD Client Tools Interface User Guide (pim2261)*, sección 4.7.

### Tabla `PHD_DATA` — consulta de series de tiempo

| Columna              | Tipo          | Rol        | Descripción                                                        |
|----------------------|---------------|------------|--------------------------------------------------------------------|
| TAGNAME              | Character     | Filtro     | Nombre del tag (ej. `'AA-FI-0001'`). Soporta `IN (...)`.          |
| TAGNO                | Integer       | Filtro     | Número de tag alternativo al nombre. Soporta `IN (...)`.           |
| START_TIMESTAMP      | Filetime      | Filtro     | Inicio del rango. Acepta expresiones relativas: `'NOW-1h'`, `'NOW-::1'` (1 hora). |
| END_TIMESTAMP        | Filetime      | Filtro     | Fin del rango. Uso típico: `'NOW'`.                                |
| TIME_FORMAT          | Integer       | Filtro     | Formato del timestamp devuelto.                                    |
| SAMPLE_INTERVAL      | Long Integer  | Filtro     | Intervalo de muestreo en segundos.                                 |
| UNITS                | Character     | Filtro     | Unidades de ingeniería del tag.                                    |
| FILTER_DATA          | True/False    | Filtro     | Activa filtrado de datos.                                          |
| RAW_DATA             | True/False    | Filtro     | `'TRUE'` devuelve datos crudos del historiador sin interpolación.  |
| RETURN_TOLERANCE     | True/False    | Filtro     | Incluye tolerancia en los valores.                                 |
| RESAMPLE_METHOD      | Character     | Filtro     | Método de remuestreo.                                              |
| MINIMUM_CONFIDENCE   | Integer       | Filtro     | Confianza mínima aceptada (0–100).                                 |
| MAXIMUM_ROWS         | Integer       | Filtro     | Límite máximo de filas devueltas.                                  |
| RETURN_MOST_RECENT   | True/False    | Filtro     | Devuelve solo el valor más reciente.                               |
| RETURN_ENUMERATIONS  | True/False    | Filtro     | Incluye enumeraciones del tag.                                     |
| REMOVE_OUTLIERS      | True/False    | Filtro     | Elimina valores atípicos.                                          |
| RETURN_LOCAL_TIME    | True/False    | Filtro     | Convierte timestamps a hora local.                                 |
| DATA_TYPE            | Character     | Resultado  | Código interno del tipo de dato.                                   |
| DATA_TYPE_NAME       | Character     | Resultado  | Nombre del tipo: `FLOAT`, `STRING`, `BOOLEAN`, `BINARY`.          |
| DATA_LENGTH          | Integer       | Resultado  | Longitud del dato.                                                 |
| TIMESTAMP            | Filetime      | Resultado  | Timestamp del valor registrado.                                    |
| CONFIDENCE           | Integer       | Resultado  | Nivel de confianza del valor (0–100).                              |
| SEQUENCE_NUMBER      | Integer       | Resultado  | Número de secuencia del registro.                                  |
| VALUE                | Variant       | Resultado  | Valor del tag. Subtipo según `DATA_TYPE_NAME`.                     |

### Tabla `PHD_TAG_BROWSE` — catálogo de tags disponibles

```sql
SELECT * FROM phd_tag_browse;
```

### Tabla `PHD_REDUCTIONS` — datos reducidos / agregados

```sql
SELECT * FROM phd_reductions
WHERE tagname = 'FT1000'
  AND reduction_type = 'Average';
```

### Tabla `PHD_WRITE_DATA` — escritura de valores

```sql
SELECT * FROM phd_write_data
WHERE tagname = 'FT1000'
  AND put_sequence_number = 1;
```

---

## Queries de referencia

### Datos crudos de múltiples tags — última hora
```sql
SELECT timestamp, tagname, value.float, data_type_name, confidence
FROM phd_data
WHERE tagname IN ('AA-FI-0001', 'AA-FI-0002')
  AND start_timestamp = 'NOW-::1'
  AND end_timestamp   = 'NOW'
  AND raw_data        = 'TRUE'
```
> `NOW-::1` = ahora menos 1 hora. Formato general: `NOW-[días:horas:minutos:segundos]`.  
> `NOW-1h` también es válido.

### Acceso al valor según tipo de dato
```sql
SELECT value.float    FROM phd_data WHERE tagname = 'TAG' AND ...  -- FLOAT
SELECT value.string   FROM phd_data WHERE tagname = 'TAG' AND ...  -- STRING
SELECT value.boolean  FROM phd_data WHERE tagname = 'TAG' AND ...  -- BOOLEAN
SELECT value.binary   FROM phd_data WHERE tagname = 'TAG' AND ...  -- BINARY
```
> Siempre verificar `DATA_TYPE_NAME` del tag antes de elegir el subtipo de `VALUE`.

---

## Reglas del driver PHD ODBC

- `TAGNAME` y `TAGNO` soportan `IN (...)` tanto en `PHD_DATA` como en `PHD_REDUCTIONS`.
- `START_TIMESTAMP` y `END_TIMESTAMP` son **obligatorios** en consultas a `PHD_DATA`.
- `VALUE` es `Variant` — acceder siempre por subtipo (`value.float`, etc.) según el `DATA_TYPE_NAME`.
- El driver solo corre en **Windows 64 bits** — incompatible con contenedores Linux.

---

## Checklist before changes

- confirm whether the change affects `local-file-system`, `odbc`, or both
- place the change in the correct layer
- keep the model interface consistent
- do not move data logic into controllers or routes
- verify that the HTTP response remains JSON when applicable
- validate environment variables if ODBC is touched
- test the affected flow with the corresponding server
- document any inferred decision as an assumption