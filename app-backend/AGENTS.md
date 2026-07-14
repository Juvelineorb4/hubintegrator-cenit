# app-backend — Agent Instructions

## Stack

| Technology    | Version | Purpose                                   |
|---------------|---------|-------------------------------------------|
| Node.js       | 20      | Runtime                                   |
| pnpm          | latest  | Package manager                           |
| Express       | 4       | REST API framework                        |
| TypeScript    | 5       | Language                                  |
| Drizzle ORM   | 0.36    | Type-safe ORM for PostgreSQL              |
| drizzle-kit   | 0.27    | Schema push / introspection CLI           |
| PostgreSQL    | 16      | Primary database (runs in Docker)         |

## Project Structure

```
app-backend/
├── Dockerfile
├── drizzle.config.ts          # Schema list (tag-value excluded — see below)
├── package.json
├── tsconfig.json
└── src/
    ├── app.routes.ts          # Mounts all module routers
    ├── index.ts
    ├── shared/
    │   └── types/
    │       └── api-response.types.ts  # ApiResponse<T> and ApiError
    ├── modules/               # Feature modules (MVC + DI)
    │   ├── system/
    │   │   ├── system.repository.ts
    │   │   ├── system.service.ts
    │   │   ├── system.controller.ts
    │   │   └── system.routes.ts       # DI wiring + Router
    │   ├── sub-system/
    │   │   ├── sub-system.repository.ts
    │   │   ├── sub-system.service.ts
    │   │   ├── sub-system.controller.ts
    │   │   └── sub-system.routes.ts
    │   ├── tag/
    │   │   ├── tag.repository.ts
    │   │   ├── tag.service.ts
    │   │   ├── tag.controller.ts
    │   │   └── tag.routes.ts       # DI wiring + Router; GET /pressure registered before /:id
    │   └── tag-value/
    │       ├── tag-value.repository.ts
    │       ├── tag-value.service.ts
    │       ├── tag-value.controller.ts
    │       └── tag-value.routes.ts
    └── core/
        └── db/
            └── drizzle/
                ├── client.ts             # Drizzle + pg client — exports DrizzleDB type
                ├── config.ts             # DB config loader
                ├── index.ts              # Re-exports
                ├── setup.ts             # Creates tag_value partitioned table + ETL trigger (idempotent)
                ├── schema/
                │   ├── index.ts
                │   ├── system-entity.schema.ts
                │   ├── sub-system.schema.ts
                │   ├── system-sub-system.schema.ts
                │   ├── tag.schema.ts
                │   ├── tag-etl-state.schema.ts
                │   ├── etl-scheduler-state.schema.ts
                │   └── tag-value.schema.ts   # Reference only — NOT in drizzle.config.ts
                └── seeds/
                    ├── demo.seed.ts          # Loads sample system, sub-system, tag
                    └── partitions.seed.ts    # Partition range creation
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Start dev server with hot reload
pnpm dev

# Push schema changes to the database + create tag_value partitioned table
pnpm db:push

# Only run setup.ts (create tag_value + current month partition)
pnpm db:setup

# Open Drizzle Studio (visual DB browser)
pnpm db:studio

# Create partitions for a date range (configure FROM/TO inside the file)
pnpm seed:partitions
```

## Database Schema

### Tables managed by Drizzle Kit (`db:push`)

| Table                | Description                                      |
|----------------------|--------------------------------------------------|
| system_entity        | Top-level systems — name (unique), code (unique), description, distance, type (`OLEODUCTO`\|`POLIDUCTO`)                                                                              |
| sub_system           | Sub-components — name (unique), code (unique), nomenclature (unique)                                                                                                                   |
| system_sub_system    | M:N relation — system ↔ sub_system (cascade delete both sides)                                                                                                                        |
| tag                  | PHD historian tags — tagname, category (`tag_category` enum), phdTagno (uniqueIndex), phdUnit, phdDataTypeName (`DOUBLE`\|`STRING`\|`BOOLEAN`\|`BINARY`\|`INTEGER`\|`FLOAT`), phdAssetName, phdDescription, historizationFrom — `systemId` and `subSystemId` are SET NULL on delete (tags become orphaned). **`tag_category` values:** `FLOW`, `FLOW_IN`, `FLOW_OUT`, `VOLUME`, `PRESSURE`, `PRESSURE_IN`, `PRESSURE_OUT`, `LEVEL`, `SELECTOR_S_E`, `PRESSURE_IN_MAX`, `PRESSURE_OUT_MAX` |
| tag_etl_state        | ETL tracking per tag — status (`PENDING`\|`RUNNING`\|`READY`\|`FAILED`\|`PAUSED`), mode (`HISTORICAL`\|`INCREMENTAL`), batchNumber (auto-assigned in groups of 50), lastLoadedDataTimestamp (init = historizationFrom \|\| createdAt), consecutiveFailures. **Auto-created by trigger `trg_tag_etl_state_on_insert` on every tag insert.** |
| etl_scheduler_state  | Singleton row (`id=1`) tracking `lastBatchExecuted` — updated by python-etl after each batch cycle |

### Partitioned table + ETL trigger (`setup.ts` — raw SQL, idempotent)

| Object                            | Type              | Description                                                                 |
|-----------------------------------|-------------------|-----------------------------------------------------------------------------|
| tag_value                         | Partitioned table | `PARTITION BY RANGE (timestamp)` — monthly, includes `tag_value_default`    |
| fn_create_tag_etl_state           | Trigger function  | Calculates `batch_number` (groups of 50), sets `last_loaded_data_timestamp` = `historization_from` or `date_trunc('month', now())` |
| trg_tag_etl_state_on_insert       | Trigger on `tag`  | Fires `AFTER INSERT` per row — auto-inserts into `tag_etl_state`            |

> **Critical constraint:** `tag_value` must **never** be added to the `schema` array in `drizzle.config.ts`. Drizzle Kit cannot generate partitioned DDL. The table is created exclusively by `setup.ts` using raw SQL with `IF NOT EXISTS`.

> **Trigger is idempotent:** `setup.ts` uses `CREATE OR REPLACE FUNCTION` and `DROP TRIGGER IF EXISTS` — safe to run on every `pnpm db:push`.

## Module Architecture (MVC + Dependency Injection)

All feature modules follow this pattern:

```
modules/<name>/
├── <name>.repository.ts   # Only Drizzle queries — receives DrizzleDB via constructor
├── <name>.service.ts      # Business logic — receives Repository via constructor
├── <name>.controller.ts   # HTTP handling — receives Service via constructor
└── <name>.routes.ts       # Wires DI manually and exports the Router
```

**Rules:**
- Repositories only import from `core/db/drizzle/` — never from other modules.
- Services never import Express types.
- Controllers never import Drizzle directly.
- DI wiring is done in `<name>.routes.ts` using `new` — no IoC container.
- Use `DrizzleDB` type (exported from `client.ts`) for repository constructor typing.

### Adding a New Module

1. Create `src/modules/<name>/` with the 4 files above.
2. Export the router from `<name>.routes.ts`.
3. Mount it in `src/app.routes.ts`:
   ```ts
   appRouter.use("/<name>s", nameRouter);
   ```
4. Update this `AGENTS.md` with the new module and its endpoints.

## REST API Endpoints

Base path: `/api`

| Method | Path                                        | Description                       |
|--------|---------------------------------------------|-----------------------------------|
| GET    | /health                                     | Health check                      |
| GET    | /systems                                    | List all systems                  |
| GET    | /systems/by-name/:name                      | Find system by name               |
| GET    | /systems/:id                                | Get system by ID                  |
| POST   | /systems                                    | Create system                     |
| GET    | /sub-systems                                | List all sub-systems              |
| GET    | /sub-systems/by-nomenclature/:nomenclature  | Find sub-system by nomenclature   |
| GET    | /sub-systems/:id                            | Get sub-system by ID              |
| POST   | /sub-systems                                | Create sub-system                 |
| POST   | /sub-systems/relations                      | Link a sub-system to a system     |
| GET    | /tags                                       | List all tags                     |
| GET    | /tags/pressure?systemCode=:code             | Pressure tags for a system (categories: PRESSURE_IN, PRESSURE_OUT, PRESSURE_IN_MAX, PRESSURE_OUT_MAX) |
| GET    | /tags/flow?systemCode=:code                 | Flow tags for a system (categories: FLOW_IN, FLOW_OUT, SELECTOR_S_E) |
| GET    | /tags/volume?systemCode=:code               | Volume tags for a system (category: VOLUME) |
| GET    | /tags/:id                                   | Get tag by ID                     |
| POST   | /tags                                       | Create tag                        |
| POST   | /phd/import                                  | Ingest systems, subsystems, and tags into schema `phd` from Excel upload. |

## Historical Data Scope

The app-backend no longer serves historical time-series reads from PostgreSQL `public.tag_value`.

Current contract boundaries are:
- `python-app -> odbc-api -> PHD` for historical values.
- `python-app -> app-backend -> schema phd catalog` for systems, subsystems, tags, and import metadata.

`app-backend` remains a catalog API over schema `phd` and does not expose `/tag-values/raw`, `/tag-values/raw/batch`, or `/tag-values/batch/historized` endpoints.

## Adding New Seeds

1. Create `src/core/db/drizzle/seeds/<name>.seed.ts`
2. Add a `run()` async function and call it with `run().catch(...)` at the bottom
3. Add a script to `package.json`:
   ```json
   "seed:<name>": "tsx src/core/db/drizzle/seeds/<name>.seed.ts"
   ```

## Partition Seeds

`seeds/partitions.seed.ts` exports:
- `createMonthPartition(year, month)` — creates a single monthly partition (idempotent)
- `createPartitionRange(from, to)` — creates partitions across a date range

Configure the range at the top of the file:
```ts
const FROM = { year: 2026, month: 1 };
const TO   = { year: 2026, month: 12 };
```

## Boundaries

- **Never edit** migration files manually.
- **Ask before** adding `tag_value` or any partitioned table to `drizzle.config.ts`.
- **Ask before** dropping or renaming existing schema tables.
- `db:push` is safe for dev; production changes require reviewed migrations.
- Always use `pnpm` — never `npm` or `yarn` in this project.
- **Keep this file up to date:** whenever a new module, endpoint, seed, or architectural decision is added, update the corresponding section in this `AGENTS.md` before finishing the task.
