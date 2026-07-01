import {
  pgTable,
  bigserial,
  uuid,
  doublePrecision,
  text,
  boolean,
  timestamp,
  index,
  primaryKey,
  check,
  unique,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tag } from "./tag.schema";

/**
 * Custom Drizzle type mapping PostgreSQL `bytea` to a Node.js `Buffer`.
 * Used for storing raw binary historian tag values.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Stores time-series values for each historian tag retrieved from the PHD system.
 *
 * This is the central fact table of the platform. It is partitioned by range
 * on the `timestamp` column for efficient time-series queries over large
 * historical datasets. Each row holds exactly one non-null value column
 * (`value_double`, `value_text`, `value_boolean`, or `value_binary`), enforced
 * by the `check_single_value` constraint, matching the tag's declared `phd_type`.
 *
 * ⚠️  **Partitioning:** This table uses `PARTITION BY RANGE (timestamp)` in
 * PostgreSQL. Drizzle Kit does not generate DDL for partitioning or child
 * partition tables — these must be managed via raw SQL migrations.
 *
 * @table tag_value
 * @partitioned PARTITION BY RANGE (timestamp)
 */
export const tagValue = pgTable(
  "tag_value",
  {
    /**
     * Auto-incrementing 64-bit integer identifier.
     * Forms part of the composite primary key together with `timestamp`,
     * as required by PostgreSQL partitioned tables.
     */
    id: bigserial("id", { mode: "number" }),

    /**
     * Foreign key to the historian tag this value belongs to.
     * Cascade deletes propagate when the parent tag is removed.
     * @references tag.id
     */
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),

    /** Numeric floating-point value. Populated when `phd_type = 'DOUBLE'`. */
    valueDouble: doublePrecision("value_double"),

    /** Textual value. Populated when `phd_type = 'STRING'`. */
    valueText: text("value_text"),

    /** Boolean value. Populated when `phd_type = 'BOOLEAN'`. */
    valueBoolean: boolean("value_boolean"),

    /** Raw binary value. Populated when `phd_type = 'BINARY'`. */
    valueBinary: bytea("value_binary"),

    /**
     * Timestamp of the data point as recorded by the historian.
     * Stored with timezone. Also serves as the range partition key.
     */
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),

  },
  (table) => ({
    /**
     * Composite primary key required by PostgreSQL for range-partitioned tables.
     * The partition key (`timestamp`) must be included in the primary key.
     */
    pk: primaryKey({ columns: [table.id, table.timestamp] }),

    /**
     * Ensures exactly one value column is non-null per row, matching the
     * tag's declared `phd_type`. Prevents inconsistent or ambiguous records.
     */
    checkSingleValue: check(
      "check_single_value",
      sql`(value_double IS NOT NULL)::int + (value_text IS NOT NULL)::int + (value_boolean IS NOT NULL)::int + (value_binary IS NOT NULL)::int = 1`
    ),

    /**
     * Prevents duplicate (tag_id, timestamp) pairs across retries and replays.
     * Enables ON CONFLICT DO NOTHING in the ETL bulk insert for idempotency.
     */
    uqTagValueTagTimestamp: unique("uq_tag_value_tag_timestamp").on(
      table.tagId,
      table.timestamp
    ),

    /**
     * Composite index on tag and timestamp for efficient time-series queries.
     * Critical for retrieving all values of a tag within a date range.
     */
    idxTagValueTagIdTimestamp: index("idx_tag_value_tag_id_timestamp").on(
      table.tagId,
      table.timestamp
    ),
  })
);