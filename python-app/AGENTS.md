# python-app — Agent Instructions

## Stack

| Technology       | Version | Purpose                                          |
|------------------|---------|--------------------------------------------------|
| Python           | 3.12    | Runtime                                          |
| FastAPI          | 0.115.0 | REST API framework                               |
| uvicorn          | 0.30.6  | ASGI server (`--reload` enabled in Docker dev)   |
| pandas           | 2.2.3   | Excel parsing only (upload flow)                 |
| openpyxl         | 3.1.5   | Excel file backend for pandas                    |
| python-multipart | 0.0.12  | Multipart file upload support                    |
| httpx            | 0.27.2  | Async HTTP client (app-backend + ODBC calls)     |

## Development Commands

```bash
# Install dependencies (run after updating requirements.txt)
pip install -r requirements.txt

# Start dev server with hot reload (from python-app/ directory)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Rebuild Docker image after requirements.txt changes
docker compose build python-app && docker compose up -d python-app
```

## Project Structure

```
python-app/
├── Dockerfile
├── requirements.txt
└── app/
    ├── main.py                       # FastAPI app entry point — registers all routers
    ├── routers/
    │   ├── upload.py                 # POST /upload/preview, POST /upload/load
    │   ├── tag_query.py              # GET /tag-values/time-sampled
    │   ├── pressure_query.py         # GET /tag-values/pressureBySystem
    │   ├── flow_query.py             # GET /tag-values/flowBySystem
    │   └── volume_query.py           # GET /tag-values/volumeBySystem
    ├── schemas/
    │   ├── upload.py                 # Pydantic models for parsed Excel output
    │   ├── tag_query.py              # TimeSampledResponse model
    │   ├── pressure_query.py         # TagValueRow, TagPressureData, PressureQueryResponse
    │   ├── flow_query.py             # TagValueRow (with state_value), TagFlowData, FlowQueryResponse
    │   └── volume_query.py           # TagValueRow, TagVolumeData, VolumeQueryResponse
    └── services/
        ├── parser.py                 # Parses Excel bytes (3 sheets) → structured dict
        ├── loader.py                 # Loads parsed data → app-backend API + ODBC enrichment
        ├── tag_query.py              # get_time_sampled() — fetches raw values, resamples with pandas
        ├── pressure_query.py         # get_pressure_by_system() — fetches historized data via /batch/historized; pairs MAIN+MAX
        ├── flow_query.py             # get_flow_by_system() — fetches historized data via /batch/historized; pairs FLOW_IN/OUT with SELECTOR_S_E
        └── volume_query.py           # get_volume_by_system() — fetches raw rows via /raw/batch; change-point output (no resampling)
```

## REST API Endpoints

Base URL: `http://localhost:8000`

| Method | Path             | Description                                                      |
|--------|------------------|------------------------------------------------------------------|
| GET    | /                | Health check                                                     |
| POST   | /upload/preview  | Parse Excel, return rows + warnings — no DB writes               |
| POST   | /upload/load     | Parse → enrich from ODBC → persist via app-backend — returns report |
| GET    | /tag-values/time-sampled | Resample raw values for a single tag by interval (`?tagname=&start=&end=&interval_seconds=`) |
| GET    | /tag-values/pressureBySystem | All PRESSURE_IN / PRESSURE_OUT tags for a system with resampled values (`?system_code=&start=&end=&interval_seconds=`) |
| GET    | /tag-values/flowBySystem | All FLOW_IN / FLOW_OUT tags paired with SELECTOR_S_E state (`?system_code=&start=&end=&interval_seconds=`) |
| GET    | /tag-values/volumeBySystem | All VOLUME tags, change-point only — no resampling (`?system_code=&start=&end=`) |

### `/upload/load` internal flow

1. Parse Excel bytes via `parser.py` (3 sheets)
2. POST each system → `BACKEND/systems`, cache `name → id`
3. POST each subsystem → `BACKEND/sub-systems`; POST relations → `BACKEND/sub-systems/relations`
4. For each tag: resolve `system_id` + `sub_system_id`, call `ODBC_API/tags/{tagname}/browse` for PHD metadata, POST → `BACKEND/tags`
5. If tag `description` is empty in the Excel, it is set to `phdDescription` from the browse response
6. Returns `{ systems: [...], subsystems: [...], tags: [...], errors: [...] }`

> ODBC errors are non-fatal — tag is saved with defaults (`phdTagno = tagname`, `phdDataTypeName = "DOUBLE"`) and the error is logged in `errors[]`.

### `/tag-values/time-sampled` flow (`tag_query.py`)

Fetches and resamples raw values for a single tag:
1. `GET BACKEND/tag-values/raw?tagname=&start=&end=` → raw rows from app-backend
2. pandas `resample()` on UTC-aware DatetimeIndex, `mean()` per bucket
3. Returns `TimeSampledResponse` with `data: [{timestamp, value}]`

### `/tag-values/pressureBySystem` flow (`pressure_query.py`)

Fetches pressure tags for a system and returns resampled values via ODBC:
1. `GET BACKEND/tags/pressure?systemCode=X` → all tags with categories PRESSURE_IN / PRESSURE_OUT / PRESSURE_IN_MAX / PRESSURE_OUT_MAX
2. Input timestamps are interpreted as **Colombia time (UTC-5)** and converted to UTC internally
3. `GET ODBC_API/tags/interval` via `OdbcHistorianClient.fetch_interval_rows()` using all tagnames, UTC start/end, and `interval_seconds`
4. Groups returned rows by tagname; picks first non-null of `valueDouble` / `valueText` / `valueBoolean`
5. Pairs each PRESSURE_IN / PRESSURE_OUT tag with its MAX companion (same system + subsystem)
6. Returns `PressureQueryResponse`; timestamps are UTC ISO 8601 strings (`"2026-04-13T17:35:42Z"`)

> No pandas or backend historization endpoint. Historical reads come from ODBC API `/tags/interval`.

### `/tag-values/flowBySystem` flow (`flow_query.py`)

Fetches flow tags for a system, returns resampled values, and pairs each main tag with its SELECTOR_S_E companion:
1. `GET BACKEND/tags/flow?systemCode=X` → all tags with categories FLOW_IN, FLOW_OUT, SELECTOR_S_E
2. Input timestamps are interpreted as **Colombia time (UTC-5)** and converted to UTC internally
3. `GET ODBC_API/tags/interval` via `OdbcHistorianClient.fetch_interval_rows()` using all tagnames, UTC start/end, and `interval_seconds`
4. Groups rows by tagname; picks first non-null value column
5. Each FLOW_IN / FLOW_OUT tag is paired with the SELECTOR_S_E tag from the same system+subsystem
6. Returns `FlowQueryResponse`; each `TagFlowData` entry has `tagname_selector` / `category_selector` fields and `data: [{timestamp, value, state_value}]`

> No pandas or backend historization endpoint. Historical reads come from ODBC API `/tags/interval`.

### `/tag-values/volumeBySystem` flow (`volume_query.py`)

Fetches volume tags for a system and returns only change-point values (no resampling):
1. `GET BACKEND/tags/volume?systemCode=X` → all tags with category VOLUME
2. Input timestamps are interpreted as **Colombia time (UTC-5)** and converted to UTC internally
3. `GET ODBC_API/tags` via `OdbcHistorianClient.fetch_raw_rows()` with all tagnames, UTC start/end
4. Groups rows by tagname; picks first non-null value column
5. `_change_points()` keeps only rows where the value changed from the previous sample
6. Returns `VolumeQueryResponse`; each `TagVolumeData` entry has `data: [{timestamp, value}]` — **no `interval_seconds` parameter**

> No pandas. Uses ODBC API `/tags` raw reads because no resampling grid is needed.

## Excel Format (3 sheets)

### Sheet `system`

| Column      | Required | Notes                       |
|-------------|----------|-----------------------------|
| name        | ✅       |                             |
| code        | ✅       |                             |
| description | ❌       | Defaults to `name` if empty |
| distance    | ❌       | Numeric                     |
| type        | ❌       | `OLEODUCTO` or `POLIDUCTO`  |

### Sheet `subsystem`

| Column       | Required | Notes                                    |
|--------------|----------|------------------------------------------|
| name         | ✅       |                                          |
| code         | ✅       |                                          |
| nomenclature | ✅       | Unique identifier (e.g., `POZ`)          |
| description  | ❌       | Defaults to `name` if empty              |
| latitude     | ❌       |                                          |
| longitude    | ❌       |                                          |
| system       | ❌       | Comma-separated system names to link     |

### Sheet `tag`

| Column                | Required | Notes                                                               |
|-----------------------|----------|---------------------------------------------------------------------|
| tagname               | ✅       | PHD tag identifier (e.g., `POZ_FIC_1311`)                           |
| description           | ❌       |                                                                     |
| category              | ❌       | `FLOW`, `FLOW_IN`, `FLOW_OUT`, `VOLUME`, `PRESSURE`, `PRESSURE_IN`, `PRESSURE_OUT`, `LEVEL`, `SELECTOR_S_E`, `PRESSURE_IN_MAX`, `PRESSURE_OUT_MAX` |
| system                | ✅       | System name (must exist in DB or same Excel)                        |
| subsystem             | ❌       | Subsystem nomenclature                                              |
| historical_from_date  | ❌       | Legacy metadata date field (e.g., `2024-01-01`)                      |
| historical_from_hour  | ❌       | Legacy metadata hour field (e.g., `00:00:00`). Defaults to `00:00:00` if date is set |

> PHD fields (`phdTagno`, `phdUnit`, `phdDataTypeName`, `phdAssetName`, `phdDescription`) are enriched automatically via `GET /tags/{tagname}/browse` on the ODBC API.

> `historical_from_date` + `historical_from_hour` are combined into `historizationFrom` (ISO timestamp) and saved on the tag as legacy metadata.

## Timestamp Contract

All timestamps returned by this API (coming from app-backend) are **UTC ISO 8601 strings without milliseconds**:

```
"2026-04-13T17:35:42Z"
```

- Normalized at the SQL level in `app-backend` — services receive strings, not `datetime` objects.
- Input timestamps from callers are treated as **Colombia time (UTC-5)** and converted to UTC before being forwarded to the backend.
- Never convert or reformat timestamps in Python services — pass them through as-is from the backend response.

## Environment Variables

| Variable     | Default                                  | Purpose                          |
|--------------|------------------------------------------|----------------------------------|
| BACKEND_URL  | `http://app-backend:3000/api`            | app-backend base URL (with /api) |
| ODBC_API_URL | `http://host.docker.internal:1234`       | odbc-api base URL (Windows host) |

## Boundaries

- ✅ **Always:** Update `requirements.txt` when adding packages; rebuild the image after changes.
- ✅ **Always:** Use `httpx.AsyncClient` for outbound HTTP — never `requests` (blocking).
- ⚠️ **Ask first:** Adding new packages, changing the exposed port (8000).
- 🚫 **Never:** Access the database directly — all DB operations go through the `app-backend` REST API.
