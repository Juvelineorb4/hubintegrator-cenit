import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { tag } from "./tag.schema";

/**
 * ETL load mode for a tag.
 * - `HISTORICAL`  — Full backfill from a start date.
 * - `INCREMENTAL` — Continuous forward loading from last loaded timestamp.
 */
export const etlModeEnum = pgEnum("etl_mode", ["HISTORICAL", "INCREMENTAL"]);

/**
 * ETL processing status for a tag.
 * - `PENDING`  — Not yet run or waiting for next cycle.
 * - `RUNNING`  — Currently being processed.
 * - `READY`    — Last run succeeded, ready for next cycle.
 * - `FAILED`   — Last attempt failed.
 * - `PAUSED`   — Manually disabled.
 */
export const etlStatusEnum = pgEnum("etl_status", [
  "PENDING",
  "RUNNING",
  "READY",
  "FAILED",
  "PAUSED",
]);

export const tagEtlState = pgTable(
  "tag_etl_state",
  {
    tagId: uuid("tag_id")
      .primaryKey()
      .references(() => tag.id, { onDelete: "cascade" }),

    lastLoadedDataTimestamp: timestamp("last_loaded_data_timestamp", {
      withTimezone: true,
    }),

    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),

    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),

    status: etlStatusEnum("status").notNull().default("PENDING"),

    mode: etlModeEnum("mode").notNull().default("HISTORICAL"),

    batchNumber: integer("batch_number").notNull().default(0),

    errorMessage: text("error_message"),

    consecutiveFailures: integer("consecutive_failures").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    modifiedAt: timestamp("modified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxBatchNumber: index("idx_tag_etl_state_batch_number").on(
      table.batchNumber
    ),
    idxStatus: index("idx_tag_etl_state_status").on(table.status),
    idxMode: index("idx_tag_etl_state_mode").on(table.mode),
    idxBatchModeStatus: index("idx_tag_etl_state_batch_mode_status").on(
      table.batchNumber,
      table.mode,
      table.status
    ),
  })
);
