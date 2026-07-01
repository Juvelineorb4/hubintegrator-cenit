import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  uniqueIndex,
  timestamp,
} from "drizzle-orm/pg-core";

export const subSystem = pgTable(
  "sub_system",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    description: text("description"),
    nomenclature: varchar("nomenclature", { length: 100 }),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    modifiedAt: timestamp("modified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxSubSystemName:        uniqueIndex("idx_sub_system_name").on(table.name),
    idxSubSystemCode:        uniqueIndex("idx_sub_system_code").on(table.code),
    idxSubSystemNomenclature: uniqueIndex("idx_sub_system_nomenclature").on(table.nomenclature),
  })
);