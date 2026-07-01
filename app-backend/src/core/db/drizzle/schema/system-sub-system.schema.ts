import {
  pgTable,
  uuid,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { systemEntity } from "./system-entity.schema";
import { subSystem } from "./sub-system.schema";

/**
 * Join table that models the many-to-many relationship between system entities
 * and subsystems.
 *
 * A single system can contain multiple subsystems, and the same subsystem can
 * be shared across different systems. The `subsystem_sequence` field allows
 * ordering subsystems within the context of a specific system.
 *
 * @table system_sub_system
 */
export const systemSubSystem = pgTable(
  "system_sub_system",
  {
    /** Unique identifier generated automatically as a UUID v4. */
    id: uuid("id").defaultRandom().primaryKey(),

    /**
     * Foreign key referencing the parent system entity.
     * Cascade deletes remove all associations when a system is deleted.
     * @references system_entity.id
     */
    systemId: uuid("system_id")
      .notNull()
      .references(() => systemEntity.id, { onDelete: "cascade" }),

    /**
     * Foreign key referencing the associated subsystem.
     * Cascade deletes remove all associations when a subsystem is deleted.
     * @references sub_system.id
     */
    subSystemId: uuid("sub_system_id")
      .notNull()
      .references(() => subSystem.id, { onDelete: "cascade" }),

    /**
     * Ordinal position of the subsystem within its parent system.
     * Used for display ordering or operational sequencing.
     */
    subsystemSequence: integer("subsystem_sequence"),

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
    /**
     * Prevents duplicate (system, subsystem) pairs — a subsystem can only
     * be linked once to a given system.
     */
    uqSystemSubSystem: uniqueIndex("uq_system_sub_system").on(
      table.systemId,
      table.subSystemId
    ),
  })
);