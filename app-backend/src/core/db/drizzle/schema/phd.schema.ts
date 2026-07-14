import { relations } from "drizzle-orm";
import {
  index,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const phdSchema = pgSchema("phd");

export const phdSystemTypeEnum = phdSchema.enum("system_type", [
  "OIL_PIPELINE",
  "PRODUCT_PIPELINE",
]);

export const phdTagMeasurementTypeEnum = phdSchema.enum("tag_measurement_type", [
  "FLOW",
  "PRESSURE",
  "LEVEL",
  "VOLUME",
  "SELECTOR",
]);

export const phdTagRoleEnum = phdSchema.enum("tag_role", [
  "NONE",
  "IN",
  "OUT",
  "S_E",
]);

export const phdTagQualifierEnum = phdSchema.enum("tag_qualifier", [
  "NORMAL",
  "MAX",
]);

export const phdDataTypeEnum = phdSchema.enum("phd_data_type", [
  "DOUBLE",
  "STRING",
  "BOOLEAN",
  "BINARY",
  "INTEGER",
  "FLOAT",
]);

export const phdSystemEntity = phdSchema.table(
  "system_entity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    description: text("description"),
    distance: numeric("distance"),
    type: phdSystemTypeEnum("type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uqPhdSystemEntityName: uniqueIndex("uq_phd_system_entity_name").on(table.name),
    uqPhdSystemEntityCode: uniqueIndex("uq_phd_system_entity_code").on(table.code),
  })
);

export const phdSubsystem = phdSchema.table(
  "subsystem",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    description: text("description"),
    nomenclature: varchar("nomenclature", { length: 100 }),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uqPhdSubsystemName: uniqueIndex("uq_phd_subsystem_name").on(table.name),
    uqPhdSubsystemCode: uniqueIndex("uq_phd_subsystem_code").on(table.code),
    uqPhdSubsystemNomenclature: uniqueIndex("uq_phd_subsystem_nomenclature").on(table.nomenclature),
  })
);

export const phdSystemSubsystem = phdSchema.table(
  "system_subsystem",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    systemId: uuid("system_id")
      .notNull()
      .references(() => phdSystemEntity.id, { onDelete: "cascade" }),
    subsystemId: uuid("subsystem_id")
      .notNull()
      .references(() => phdSubsystem.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uqPhdSystemSubsystemPair: uniqueIndex("uq_phd_system_subsystem_pair").on(table.systemId, table.subsystemId),
    idxPhdSystemSubsystemSubsystemId: index("idx_phd_system_subsystem_subsystem_id").on(table.subsystemId),
  })
);

export const phdTag = phdSchema.table(
  "tag",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tagname: varchar("tagname", { length: 255 }).notNull(),
    description: text("description"),
    measurementType: phdTagMeasurementTypeEnum("measurement_type").notNull(),
    role: phdTagRoleEnum("role").notNull(),
    qualifier: phdTagQualifierEnum("qualifier").notNull(),
    phdTagNo: varchar("phd_tag_no", { length: 100 }).notNull(),
    phdUnit: varchar("phd_unit", { length: 50 }),
    phdDataType: phdDataTypeEnum("phd_data_type").notNull(),
    phdAssetName: varchar("phd_asset_name", { length: 255 }),
    phdDescription: text("phd_description"),
    systemSubsystemId: uuid("system_subsystem_id")
      .notNull()
      .references(() => phdSystemSubsystem.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uqPhdTagTagname: uniqueIndex("uq_phd_tag_tagname").on(table.tagname),
    idxPhdTagSystemSubsystemMeasurementRoleQualifier: index("idx_phd_tag_syssub_measurement_role_qualifier").on(
      table.systemSubsystemId,
      table.measurementType,
      table.role,
      table.qualifier
    ),
  })
);

export const phdSystemGroup = phdSchema.table(
  "system_group",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    displayOrder: integer("display_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uqPhdSystemGroupName: uniqueIndex("uq_phd_system_group_name").on(table.name),
  })
);

export const phdSystemGroupMember = phdSchema.table(
  "system_group_member",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    systemGroupId: uuid("system_group_id")
      .notNull()
      .references(() => phdSystemGroup.id, { onDelete: "cascade" }),
    systemId: uuid("system_id")
      .notNull()
      .references(() => phdSystemEntity.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uqPhdSystemGroupMemberPair: uniqueIndex("uq_phd_system_group_member_pair").on(table.systemGroupId, table.systemId),
    uqPhdSystemGroupMemberDisplayOrder: uniqueIndex("uq_phd_system_group_member_display_order").on(
      table.systemGroupId,
      table.displayOrder
    ),
    idxPhdSystemGroupMemberSystemId: index("idx_phd_system_group_member_system_id").on(table.systemId),
  })
);

export const phdSystemEntityRelations = relations(phdSystemEntity, ({ many }) => ({
  systemSubsystems: many(phdSystemSubsystem),
  systemGroupMembers: many(phdSystemGroupMember),
}));

export const phdSubsystemRelations = relations(phdSubsystem, ({ many }) => ({
  systemSubsystems: many(phdSystemSubsystem),
}));

export const phdSystemSubsystemRelations = relations(phdSystemSubsystem, ({ one, many }) => ({
  systemEntity: one(phdSystemEntity, {
    fields: [phdSystemSubsystem.systemId],
    references: [phdSystemEntity.id],
  }),
  subsystem: one(phdSubsystem, {
    fields: [phdSystemSubsystem.subsystemId],
    references: [phdSubsystem.id],
  }),
  tags: many(phdTag),
}));

export const phdTagRelations = relations(phdTag, ({ one }) => ({
  systemSubsystem: one(phdSystemSubsystem, {
    fields: [phdTag.systemSubsystemId],
    references: [phdSystemSubsystem.id],
  }),
}));

export const phdSystemGroupRelations = relations(phdSystemGroup, ({ many }) => ({
  members: many(phdSystemGroupMember),
}));

export const phdSystemGroupMemberRelations = relations(phdSystemGroupMember, ({ one }) => ({
  systemGroup: one(phdSystemGroup, {
    fields: [phdSystemGroupMember.systemGroupId],
    references: [phdSystemGroup.id],
  }),
  systemEntity: one(phdSystemEntity, {
    fields: [phdSystemGroupMember.systemId],
    references: [phdSystemEntity.id],
  }),
}));
