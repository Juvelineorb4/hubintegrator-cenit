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
├── drizzle.phd.config.ts      # Official Drizzle config for schema `phd`
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
    └── core/
        └── db/
            └── drizzle/
                ├── client.ts             # Drizzle + pg client — exports DrizzleDB type
                ├── config.ts             # DB config loader
                ├── index.ts              # Re-exports
                ├── schema/
                │   ├── index.ts
                │   └── phd.schema.ts     # Single active domain model
                └── seeds/
                    └── phd-demo.seed.ts  # Approved phd demo seed
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Start dev server with hot reload
pnpm dev

# Use only the phd configuration and approved phd seed
pnpm db:phd:push
pnpm db:phd:seed

# Open Drizzle Studio against the phd config
pnpm db:studio
```

## Database Schema

### Tables managed by Drizzle Kit (`db:phd:push`)

| Table               | Description                         |
|---------------------|-------------------------------------|
| system_entity       | Top-level systems in schema `phd`   |
| subsystem           | Sub-components in schema `phd`      |
| system_subsystem    | M:N relation system ↔ subsystem     |
| tag                 | PHD historian tags in schema `phd`  |
| system_group        | System groups in schema `phd`       |
| system_group_member | Membership relation for system groups |

### Active Schema

The only active schema entrypoint is `src/core/db/drizzle/schema/phd.schema.ts`.

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

`app-backend` is a catalog API over schema `phd`.

Historical historian reads live in `python-app` through `odbc-api`; `app-backend` only serves systems, subsystems, tags, system groups, and import metadata from `phd`.

## Adding New Seeds

1. Create `src/core/db/drizzle/seeds/<name>.seed.ts`
2. Add a `run()` async function and call it with `run().catch(...)` at the bottom
3. Add a script to `package.json`:
   ```json
   "seed:<name>": "tsx src/core/db/drizzle/seeds/<name>.seed.ts"
   ```

## Seeds

Use `src/core/db/drizzle/seeds/phd-demo.seed.ts` for the approved demo seed.

## Boundaries

- **Never edit** migration files manually.
- **Ask before** changing the active `phd` schema configuration or adding a second Drizzle config.
- **Ask before** dropping or renaming existing schema tables.
- `db:phd:push` is the approved schema workflow; production changes require reviewed migrations.
- Always use `pnpm` — never `npm` or `yarn` in this project.
- **Keep this file up to date:** whenever a new module, endpoint, seed, or architectural decision is added, update the corresponding section in this `AGENTS.md` before finishing the task.
