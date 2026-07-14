## ⚠️ Disclaimer

This version (v0.1.0) is intended for internal use and validation in controlled OT environments. Not production hardened.

# Hub Integrator

**A centralized on-premise OT data integration and query platform for industrial SCADA systems.**

---

## Description

Hub Integrator is an enterprise-grade solution designed to centralize and query operational technology (OT) data from industrial historians. This version (v0.1.0) provides initial data extraction, storage, and API-based querying capabilities from a PHD (Process History Database) historian system.

The system integrates with the **POSOS-GALAN industrial complex**, comprising four production stations (POSOS, AYACUCHO, COPEY, GALAN) and manages 21 process tags across pressure, flow, and volume measurement categories.

**Deployment Model:** On-premise, Local architecture installed on windows server 2022.

---

## Features

### Core Capabilities
- **PostgreSQL Data Layer** – Persistent storage with normalized hierarchical schema
- **Hierarchical Tag Organization** – SYSTEM → SUBSYSTEM → TAG model for scalable data management
- **Real-time Data Integration** – Direct historian reads via ODBC API bridge
- **RESTful API Layer** – Query-based endpoints for historical and real-time data retrieval
- **ODBC Connectivity** – Direct integration with PHD historian via ODBC protocol

### Data Operations
- Bulk initialization of systems, subsystems, and tag definitions
- Last-known value queries with timestamp metadata
- Time-range historical queries (pressure and flow data by system)
- Volume tag queries with change-event aggregation

---

## Architecture

### Deployment Stack
```
Docker Compose Orchestration
├── PostgreSQL 16 (alpine)          [Data persistence]
├── Node.js Backend v20 (alpine)    [Core orchestration & ODBC bridge]
├── Python API Service (3.12 alpine) [RESTful API layer]
└── ODBC API Bridge (Node.js)        [PHD SHADOW connection]
```

### Data Flow
```
PHD SHADOW ODBC
    ↓
ODBC API Bridge (Node.js)
    ↓
Python API Service
    ↓
Client Applications
```

### Technology Stack
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Database | PostgreSQL 16 | Normalized data storage and indexing |
| Backend Orchestration | Node.js 20 + Express | ODBC driver integration & routing |
| API Service | FastAPI (Python 3.12) | REST endpoints & data queries |
| Containerization | Docker Compose | Multi-service orchestration |
| Connectivity | ODBC | PHD historian protocol |

---

## Setup & Execution

### Prerequisites
- Docker Engine (v20.10+)
- Docker Compose (v1.29+)
- 4GB minimum available memory
- Network access to PHD SHADOW ODBC endpoint

### Quick Start

#### 1. Environment Configuration
Create a `.env` file in the deployment root:

```env
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=hubintegrator
DB_USER=postgres
DB_PASSWORD=secure_password_here

# ODBC Connection
ODBC_DSN=PHD_SHADOW
ODBC_USER=historian_user
ODBC_PASSWORD=historian_password

# API Services
API_PORT=8000
BACKEND_PORT=3000

# Environment
NODE_ENV=production
PYTHON_ENV=production
```

### Import Metadata Enrichment (Phase 5C1)

`POST /api/phd/import` now supports metadata enrichment through odbc-api browse.

Environment variables:

```env
PHD_METADATA_MODE=disabled
PHD_METADATA_CONCURRENCY=5
PHD_METADATA_MAX_TAGS=1000

ODBC_API_URL=http://<IP_O_DNS_WINDOWS>:1234
ODBC_CONNECT_TIMEOUT_SECONDS=10
ODBC_READ_TIMEOUT_SECONDS=120
```

Recommended per environment:

- Laptop/development:
  - `PHD_METADATA_MODE=disabled`
- Validation server:
  - `PHD_METADATA_MODE=required`
  - `ODBC_API_URL=http://IP_DEL_BRIDGE:1234`
  - `PHD_METADATA_CONCURRENCY=5`
  - `PHD_METADATA_MAX_TAGS=1000`

#### 2. Deploy Services
```bash
cd v1/
docker-compose up -d
```

#### 3. Verify Deployment
```bash
# Check service health
docker-compose ps

# View logs
docker-compose logs -f

# Test API connectivity
curl http://localhost:8000/health
```

#### 4. Initialize Data
```bash
# Create database schema and seed initial tag definitions
docker-compose exec app-backend npm run init:db
```

---

## API Endpoints

The system exposes three independent API services with complementary functionality:

### 1. Backend API (Node.js) - Port 3000
**Base URL:** `http://<server>:3000`

#### Health Check
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health status |

#### Systems Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/systems` | List all registered systems |
| `GET` | `/systems/:id` | Get system by ID |
| `GET` | `/systems/by-name/:name` | Get system by name |
| `POST` | `/systems` | Create new system |

#### Sub-Systems Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sub-systems` | List all sub-systems |
| `GET` | `/sub-systems/:id` | Get sub-system by ID |
| `GET` | `/sub-systems/by-nomenclature/:nomenclature` | Get sub-system by nomenclature |
| `POST` | `/sub-systems` | Create new sub-system |
| `POST` | `/sub-systems/relations` | Create sub-system relations |

#### Tags Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tags` | List all tags |
| `GET` | `/tags/:id` | Get tag by ID |
| `GET` | `/tags/pressure` | Get all pressure tags by system code |
| `GET` | `/tags/flow` | Get all flow tags by system code |
| `GET` | `/tags/volume` | Get all volume tags by system code |
| `POST` | `/tags` | Create new tag |

#### Tag Values (Raw Data Access)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tag-values/raw?...` | Get raw tag values with query parameters |
| `POST` | `/tag-values/raw/batch` | Batch query raw tag values |
| `POST` | `/tag-values/batch/historized` | Batch query historized tag values |

### 2. ODBC API Bridge (Node.js) - Port 1234
**Base URL:** `http://<server>:1234`

Direct ODBC bridge to PHD SHADOW database:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tags/:tagname` | Get historical data for specific tag |
| `GET` | `/tags/:tagname/browse` | Browse tag metadata in PHD |
| `GET` | `/tags` | Get data for multiple tags |
| `GET` | `/tags/interval` | Get tag data with time-based interval resampling |

**Query Parameters:**
- `tagnames` – Comma-separated tag names (for batch queries)
- `start` – Start datetime (format: `YYYY-MM-DD HH:MM:SS` or ISO 8601)
- `end` – End datetime (format: `YYYY-MM-DD HH:MM:SS` or ISO 8601)
- `interval_seconds` – Resample interval in seconds (for interval endpoint)

**Example:**
```
GET /tags/POZ_PIC_1634?start=2026-04-01 00:00:00&end=2026-04-14 23:59:59
GET /tags/interval?tagnames=POZ_PIC_1634,AYA_PT_1601&start=2026-04-01 00:00:00&end=2026-04-14 23:59:59&interval_seconds=60
```

### 3. Python API Service (FastAPI) - Port 8000
**Base URL:** `http://<server>:8000`

High-level API for common query patterns with built-in caching:

#### Health Check
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Service status and info |

#### Tag Value Queries
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tag-values/time-sampled` | Raw tag values resampled by interval |
| `GET` | `/tag-values/pressureBySystem` | Pressure tags for a system (resampled) |
| `GET` | `/tag-values/flowBySystem` | Flow tags for a system (resampled) |
| `GET` | `/tag-values/volumeBySystem` | Volume tags for a system (event-based) |

**Query Parameters:**
- `tagname` – Single tag name (for time-sampled query)
- `system_code` – System code from `system_entity.code` (for system queries)
- `start` – Start datetime (ISO 8601, e.g., `2026-04-01T00:00:00`)
- `end` – End datetime (ISO 8601, e.g., `2026-04-14T23:59:59`)
- `interval_seconds` – Resample interval in seconds (default: 60, only for pressure/flow)

**Examples:**
```
GET /tag-values/time-sampled?tagname=POZ_PIC_1634&start=2026-04-01T00:00:00&end=2026-04-14T23:59:59&interval_seconds=300

GET /tag-values/pressureBySystem?system_code=POSOS&start=2026-04-01T00:00:00&end=2026-04-14T23:59:59&interval_seconds=60

GET /tag-values/volumeBySystem?system_code=POSOS&start=2026-04-01T00:00:00&end=2026-04-14T23:59:59
```

### Response Format (Python API)
```json
{
  "system_code": "POSOS",
  "start": "2026-04-01T00:00:00",
  "end": "2026-04-14T23:59:59",
  "interval_seconds": 60,
  "total_tags": 3,
  "tags": [
    {
      "tagname": "POZ_PIC_1634",
      "tagtype": "PRESSURE",
      "values": [
        {
          "timestamp": "2026-04-01T00:00:00",
          "value": 45.67
        }
      ]
    }
  ]
}
```

### API Service Architecture
- **Backend (Port 3000):** Data management (CRUD operations on systems, subsystems, tags)
- **ODBC Bridge (Port 1234):** Direct PHD database access, lowest latency
- **Python API (Port 8000):** High-level queries with caching, recommended for frequent queries

---

## Data Scope

### Monitored Systems & Tags

Hub Integrator v0.1.0 manages **21 production tags** across four operational stations:

#### POSOS Station
**Pressure Tags:**
- `POZ_PIC_1634` – Pressure indicator/controller
- `POZ_MAOP_DES_L14` – MAOP discharge line L14

**Flow Tags:**
- `POZ_FIC_1311` – Flow indicator/controller
- `POZ_CTRL_D14_ES` – Control valve D14 electrical signal

**Volume Tags:**
- `POZ_VL1311ABBTN` – Volume level accumulator

#### AYACUCHO Station
**Pressure Tags:**
- `AYA_PT_1601` – Pressure transmitter
- `AYA_PIC_1411` – Pressure indicator/controller
- `AYA_MAOP_REC_L14` – MAOP recovery line L14
- `AYA_MAOP_DES_L14_REF` – MAOP discharge reference *(Pending historization)*

**Flow Tags:**
- `AYA_FIC_1401` – Flow indicator/controller
- `AYA_CTRLgal_E_S` – Control valve electrical signal

**Volume Tags:**
- `AYA_VL1330ABTN` – Volume level accumulator

#### COPEY Station
**Pressure Tags:**
- `COP_PT_1606` – Pressure transmitter
- `COP_PIC_1601` – Pressure indicator/controller
- `COP_MAOP_REC_L14` – MAOP recovery line L14
- `COP_MAOP_DES_L14` – MAOP discharge line L14

**Flow Tags:**
- `COP_FIC_1601` – Flow indicator/controller
- `COP_CTRLL14_E_S` – Control valve L14 electrical signal

#### GALAN Station
**Pressure Tags:**
- `GAL_PT_1602A` – Pressure transmitter
- `GAL_MAOP_REC_L14` – MAOP recovery line L14 *(Pending historization)*

**Flow Tags:**
- `GAL_FT1312A_D_B` – Flow transmitter D.B variant
- `GAL_CTRL14_E_S` – Control valve L14 electrical signal

**Volume Tags:**
- `GAL_VL1312ADBTN` – Volume level accumulator

**Note:** Tags marked as "Pending historization" have tag definitions registered but data collection is not yet active.

---

## Limitations

This is an early-stage release (v0.1.0) with the following constraints:

### Current Scope
- **Fixed dataset:** Limited to 21 defined tags; dynamic tag registration not yet supported
- **Single historian source:** PHD SHADOW only; multi-source integration planned
- **Query resolution:** Historical data granularity depends on historian archiving policy (typically 1-second minimum)
- **Real-time latency:** ETL batch interval of 5 minutes; sub-minute updates not supported
- **Authentication:** No user authentication or role-based access control implemented
- **Data retention:** No automatic data archival or purge policies configured

### Known Issues
- Volume tag event aggregation may have ±10 second timing variance
- ODBC connectivity requires valid network routing to PHD SHADOW host
- Bulk historical queries (>30 days) may experience elevated response latency (>5 seconds)

### Performance Boundaries
- Maximum concurrent API requests: 50 per service instance
- Supported query window: up to 90 days historical data
- Minimum query interval: 1 second

---

## Version

**Current:** v0.1.0 (Released: Q2 2026)

This is the first functional release supporting data extraction, PostgreSQL persistence, and API-based querying of industrial OT tags.

---

## Roadmap (EXAMPLES)

### v0.2.0 (Planned Q3 2026)
- [ ] Tag management API (CRUD operations)
- [ ] Role-based access control (RBAC)
- [ ] Advanced time-series aggregations (min/max/avg)
- [ ] Data export (CSV/JSON formats)
- [ ] Improved ODBC error handling and retry logic

### v0.3.0 (Planned Q4 2026)
- [ ] Multi-historian source support
- [ ] Real-time WebSocket data streaming
- [ ] Historical data archival to object storage
- [ ] Advanced alerting on threshold breaches
- [ ] Grafana/Kibana integration templates

### v1.0.0 (Planned Q1 2027)
- [ ] Full user authentication (LDAP/OAuth2)
- [ ] Audit logging and compliance reporting
- [ ] High-availability clustering support
- [ ] Production SLA guarantees
- [ ] Comprehensive admin dashboard

---

## Support & Documentation

For deployment issues, architecture inquiries, or feature requests, consult the service-specific documentation:
- **Backend Service:** `app-backend/README.md`
- **Python API:** `python-app/README.md`
- **ETL Pipeline:** `python-etl/README.md`
- **ODBC Bridge:** `odbc-api/README.md`

---

**License:** [Specify if applicable]  
**Maintainer:** CENIT Development Team  
**Status:** Active Development
#   h u b i n t e g r a t o r - c e n i t 
 
 