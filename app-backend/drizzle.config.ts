import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // tag-value.schema.ts is intentionally excluded:
  // tag_value must be created as PARTITION BY RANGE via setup.ts — Drizzle Kit
  // does not support partitioned table DDL and would create it as a regular table.
  schema: [
    "./src/core/db/drizzle/schema/system-entity.schema.ts",
    "./src/core/db/drizzle/schema/sub-system.schema.ts",
    "./src/core/db/drizzle/schema/system-sub-system.schema.ts",
    "./src/core/db/drizzle/schema/tag.schema.ts",
    "./src/core/db/drizzle/schema/tag-etl-state.schema.ts",
    "./src/core/db/drizzle/schema/etl-scheduler-state.schema.ts",
  ],
  out: "./src/core/db/drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
});