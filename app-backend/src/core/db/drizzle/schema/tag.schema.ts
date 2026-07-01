import {
  pgTable,
  uuid,
  varchar,
  text,
  pgEnum,
  index,
  uniqueIndex,
  timestamp,
} from "drizzle-orm/pg-core";
import { systemEntity } from "./system-entity.schema";
import { subSystem } from "./sub-system.schema";

/**
 * Enum representing the measurement category of a historian tag.
 *
 * - `FLOW`     — Tags measuring volumetric or mass flow rates.
 * - `PRESSURE` — Tags measuring pressure at a given point.
 * - `LEVEL`    — Tags measuring liquid or gas levels in a vessel.
 */
export const tagCategoryEnum = pgEnum("tag_category", [
  "FLOW",
  "FLOW_IN",
  "FLOW_OUT",
  "PRESSURE",
  "PRESSURE_IN",
  "PRESSURE_OUT",
  "LEVEL",
  "SELECTOR_S_E",
  "PRESSURE_IN_MAX",
  "PRESSURE_OUT_MAX",
  "VOLUME"
]);

/**
 * Enum representing the native data type of a tag value in the PHD historian.
 *
 * - `DOUBLE`   — 64-bit floating-point numeric value.
 * - `STRING`   — Textual or alphanumeric value.
 * - `BOOLEAN`  — Binary true/false flag.
 * - `BINARY`   — Raw binary data stored as bytea in `tag_value`.
 * - `INTEGER`  — 32-bit integer numeric value.
 */
export const phdTypeEnum = pgEnum("phd_type", [
  "DOUBLE",
  "STRING",
  "BOOLEAN",
  "BINARY",
  "INTEGER",
  "FLOAT"
]);

/**
 * Represents a historian tag from the PHD (Process Historian Data) system.
 *
 * A tag is the atomic unit of measurement captured by the historian. Each tag
 * belongs to a system entity and optionally to a subsystem. Its metadata drives
 * data retrieval and storage type resolution in the `tag_value` table.
 *
 * @table tag
 */
export const tag = pgTable(
  "tag",
  {
    /** Unique identifier generated automatically as a UUID v4. */
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tag name as registered in the PHD historian system. */
    tagname: varchar("tagname", { length: 255 }).notNull(),

    /** Optional free-text description providing engineering context. */
    description: text("description"),

    /** Measurement category that classifies the physical variable being recorded. */
    category: tagCategoryEnum("category"),

    /** Tag identifier as registered in the PHD historian system. Required for data retrieval. */
    phdTagno: varchar("phd_tagno", { length: 100 }).notNull(),

    /** Engineering unit of the tag value (e.g., "bbl/d", "psi", "m"). */
    phdUnit: varchar("phd_unit", { length: 50 }),

    /**
     * Native data type of the tag value as defined in the PHD historian.
     * Determines which value column is populated in `tag_value`.
     */
    phdDataTypeName: phdTypeEnum("phd_data_type_name").notNull(),

    /** Asset name associated with this tag in the PHD historian. */
    phdAssetName: varchar("phd_asset_name", { length: 255 }),

    /** Description of the tag as returned by the PHD historian via ODBC query. */
    phdDescription: text("phd_description"),

    /**
     * Foreign key referencing the system entity this tag belongs to.
     * Set null when the system is deleted — tag becomes orphaned.
     * @references system_entity.id
     */
    systemId: uuid("system_id").references(() => systemEntity.id, { onDelete: "set null" }),

    /**
     * Optional foreign key referencing the subsystem where this tag is located.
     * Set null when the subsystem is deleted — tag becomes orphaned.
     * @references sub_system.id
     */
    subSystemId: uuid("sub_system_id").references(() => subSystem.id, { onDelete: "set null" }),

    /**
     * Start date from which historical data should be loaded for this tag.
     * Set via Excel at import time. The ETL uses this as the initial
     * `last_loaded_data_timestamp` to know from where to begin loading.
     * If null, the trigger falls back to `created_at`.
     */
    historizationFrom: timestamp("historization_from", { withTimezone: true }),

    /** Timestamp of record creation, set automatically at insert time. */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Timestamp of the last record modification, updated on every change. */
    modifiedAt: timestamp("modified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    /** Index to speed up lookups and filtering by tag name. */
    idxTagName: index("idx_tag_name").on(table.tagname),

    /** Unique index to enforce one tag per PHD tag number. */
    idxTagPhdTagno: uniqueIndex("idx_tag_phd_tagno").on(table.phdTagno),
  })
);