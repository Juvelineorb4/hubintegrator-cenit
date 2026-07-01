import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  pgEnum,
  uniqueIndex,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Enum representing the type of pipeline system.
 *
 * - `OLEODUCTO` — Crude oil pipeline.
 * - `POLIDUCTO` — Multi-product pipeline.
 */
export const systemTypeEnum = pgEnum("system_type", [
  "OLEODUCTO",
  "POLIDUCTO",
]);

export const systemEntity = pgTable(
  "system_entity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    description: text("description"),
    distance: numeric("distance"),
    type: systemTypeEnum("type"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    modifiedAt: timestamp("modified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxSystemEntityName: uniqueIndex("idx_system_entity_name").on(table.name),
    idxSystemEntityCode: uniqueIndex("idx_system_entity_code").on(table.code),
  })
);