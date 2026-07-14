import { and, eq, sql } from "drizzle-orm";

import { db, pool } from "../client";
import {
  phdSubsystem,
  phdSystemEntity,
  phdSystemGroup,
  phdSystemGroupMember,
  phdSystemSubsystem,
  phdTag,
} from "../schema/phd.schema";
import { derivePublicTagCategory } from "../../../../shared/phd/tag-category";

type SystemSeed = {
  name: string;
  code: string;
  description: string;
  distance: string;
  type: "OIL_PIPELINE" | "PRODUCT_PIPELINE";
};

type SubsystemSeed = {
  name: string;
  code: string;
  nomenclature: string;
  description: string;
  latitude: string;
  longitude: string;
};

type TagSeed = {
  tagname: string;
  description: string;
  measurementType: "FLOW" | "PRESSURE" | "LEVEL" | "VOLUME" | "SELECTOR";
  role: "NONE" | "IN" | "OUT" | "S_E";
  qualifier: "NORMAL" | "MAX";
  phdTagNo: string;
  phdUnit: string;
  phdDataType: "DOUBLE" | "STRING" | "BOOLEAN" | "BINARY" | "INTEGER" | "FLOAT";
  phdAssetName: string;
  phdDescription: string;
  systemSubsystemCode: string;
};

const SYSTEMS: SystemSeed[] = [
  {
    name: "Pozos - Galan L.14",
    code: "11",
    description: "Sistema de prueba PHD",
    distance: "128.4",
    type: "OIL_PIPELINE",
  },
  {
    name: "Tramo Norte L.22",
    code: "22",
    description: "Sistema secundario para agrupaciones",
    distance: "210.7",
    type: "PRODUCT_PIPELINE",
  },
];

const SUBSYSTEMS: SubsystemSeed[] = [
  {
    name: "Ayacucho",
    code: "AYA",
    nomenclature: "AYA",
    description: "Subestacion Ayacucho",
    latitude: "10.9685",
    longitude: "-74.7813",
  },
  {
    name: "Copey",
    code: "COP",
    nomenclature: "COP",
    description: "Subestacion Copey",
    latitude: "10.1501",
    longitude: "-73.9614",
  },
];

const SYSTEM_SUBSYSTEM_RELATIONS = [
  { systemCode: "11", subsystemCode: "AYA", displayOrder: 1 },
  { systemCode: "11", subsystemCode: "COP", displayOrder: 2 },
] as const;

const TAGS: TagSeed[] = [
  {
    tagname: "AYA_FI_1001",
    description: "Flujo entrada Ayacucho",
    measurementType: "FLOW",
    role: "IN",
    qualifier: "NORMAL",
    phdTagNo: "50001",
    phdUnit: "BPH",
    phdDataType: "FLOAT",
    phdAssetName: "asset_aya_flow_in",
    phdDescription: "FLOW_IN normal",
    systemSubsystemCode: "11|AYA",
  },
  {
    tagname: "AYA_FO_1002",
    description: "Flujo salida Ayacucho",
    measurementType: "FLOW",
    role: "OUT",
    qualifier: "NORMAL",
    phdTagNo: "50001",
    phdUnit: "BPH",
    phdDataType: "FLOAT",
    phdAssetName: "asset_aya_flow_out",
    phdDescription: "FLOW_OUT normal",
    systemSubsystemCode: "11|AYA",
  },
  {
    tagname: "AYA_PI_2001",
    description: "Presion entrada Ayacucho",
    measurementType: "PRESSURE",
    role: "IN",
    qualifier: "NORMAL",
    phdTagNo: "51001",
    phdUnit: "PSI",
    phdDataType: "DOUBLE",
    phdAssetName: "asset_aya_pressure_in",
    phdDescription: "PRESSURE_IN normal",
    systemSubsystemCode: "11|AYA",
  },
  {
    tagname: "AYA_PO_2002",
    description: "Presion salida Ayacucho",
    measurementType: "PRESSURE",
    role: "OUT",
    qualifier: "NORMAL",
    phdTagNo: "51002",
    phdUnit: "PSI",
    phdDataType: "DOUBLE",
    phdAssetName: "asset_aya_pressure_out",
    phdDescription: "PRESSURE_OUT normal",
    systemSubsystemCode: "11|AYA",
  },
  {
    tagname: "AYA_PI_MAX_2003",
    description: "Presion entrada maxima Ayacucho",
    measurementType: "PRESSURE",
    role: "IN",
    qualifier: "MAX",
    phdTagNo: "51003",
    phdUnit: "PSI",
    phdDataType: "DOUBLE",
    phdAssetName: "asset_aya_pressure_in_max",
    phdDescription: "PRESSURE_IN max",
    systemSubsystemCode: "11|AYA",
  },
  {
    tagname: "AYA_PO_MAX_2004",
    description: "Presion salida maxima Ayacucho",
    measurementType: "PRESSURE",
    role: "OUT",
    qualifier: "MAX",
    phdTagNo: "51004",
    phdUnit: "PSI",
    phdDataType: "DOUBLE",
    phdAssetName: "asset_aya_pressure_out_max",
    phdDescription: "PRESSURE_OUT max",
    systemSubsystemCode: "11|AYA",
  },
  {
    tagname: "COP_LEVEL_3001",
    description: "Nivel Copey",
    measurementType: "LEVEL",
    role: "NONE",
    qualifier: "NORMAL",
    phdTagNo: "52001",
    phdUnit: "M",
    phdDataType: "FLOAT",
    phdAssetName: "asset_cop_level",
    phdDescription: "LEVEL normal",
    systemSubsystemCode: "11|COP",
  },
  {
    tagname: "COP_VOL_4001",
    description: "Volumen Copey",
    measurementType: "VOLUME",
    role: "NONE",
    qualifier: "NORMAL",
    phdTagNo: "53001",
    phdUnit: "BBL",
    phdDataType: "DOUBLE",
    phdAssetName: "asset_cop_volume",
    phdDescription: "VOLUME normal",
    systemSubsystemCode: "11|COP",
  },
  {
    tagname: "COP_SEL_5001",
    description: "Selector S/E Copey",
    measurementType: "SELECTOR",
    role: "S_E",
    qualifier: "NORMAL",
    phdTagNo: "54001",
    phdUnit: "STATE",
    phdDataType: "STRING",
    phdAssetName: "asset_cop_selector",
    phdDescription: "SELECTOR_S_E normal",
    systemSubsystemCode: "11|COP",
  },
];

async function countRows(tableName: string): Promise<number> {
  const result = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM phd.${tableName}`));
  return Number(result.rows[0]?.c ?? 0);
}

async function upsertSystem(system: SystemSeed) {
  const [row] = await db
    .insert(phdSystemEntity)
    .values({
      name: system.name,
      code: system.code,
      description: system.description,
      distance: system.distance,
      type: system.type,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: phdSystemEntity.code,
      set: {
        name: system.name,
        description: system.description,
        distance: system.distance,
        type: system.type,
        updatedAt: new Date(),
      },
    })
    .returning({ id: phdSystemEntity.id, code: phdSystemEntity.code });

  return row;
}

async function upsertSubsystem(subsystem: SubsystemSeed) {
  const [row] = await db
    .insert(phdSubsystem)
    .values({
      name: subsystem.name,
      code: subsystem.code,
      nomenclature: subsystem.nomenclature,
      description: subsystem.description,
      latitude: subsystem.latitude,
      longitude: subsystem.longitude,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: phdSubsystem.code,
      set: {
        name: subsystem.name,
        nomenclature: subsystem.nomenclature,
        description: subsystem.description,
        latitude: subsystem.latitude,
        longitude: subsystem.longitude,
        updatedAt: new Date(),
      },
    })
    .returning({ id: phdSubsystem.id, code: phdSubsystem.code });

  return row;
}

async function upsertSystemSubsystem(systemId: string, subsystemId: string, displayOrder: number) {
  const [row] = await db
    .insert(phdSystemSubsystem)
    .values({
      systemId,
      subsystemId,
      displayOrder,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [phdSystemSubsystem.systemId, phdSystemSubsystem.subsystemId],
      set: {
        displayOrder,
        updatedAt: new Date(),
      },
    })
    .returning({ id: phdSystemSubsystem.id });

  return row;
}

async function upsertTag(tagSeed: TagSeed, systemSubsystemId: string) {
  const [row] = await db
    .insert(phdTag)
    .values({
      tagname: tagSeed.tagname,
      description: tagSeed.description,
      measurementType: tagSeed.measurementType,
      role: tagSeed.role,
      qualifier: tagSeed.qualifier,
      phdTagNo: tagSeed.phdTagNo,
      phdUnit: tagSeed.phdUnit,
      phdDataType: tagSeed.phdDataType,
      phdAssetName: tagSeed.phdAssetName,
      phdDescription: tagSeed.phdDescription,
      systemSubsystemId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: phdTag.tagname,
      set: {
        description: tagSeed.description,
        measurementType: tagSeed.measurementType,
        role: tagSeed.role,
        qualifier: tagSeed.qualifier,
        phdTagNo: tagSeed.phdTagNo,
        phdUnit: tagSeed.phdUnit,
        phdDataType: tagSeed.phdDataType,
        phdAssetName: tagSeed.phdAssetName,
        phdDescription: tagSeed.phdDescription,
        systemSubsystemId,
        updatedAt: new Date(),
      },
    })
    .returning({ id: phdTag.id, tagname: phdTag.tagname });

  const derived = derivePublicTagCategory(tagSeed.measurementType, tagSeed.role, tagSeed.qualifier);
  console.log(`  tag ${row.tagname} -> ${derived}`);

  return row;
}

async function upsertSystemGroup(name: string, description: string, displayOrder: number) {
  const [row] = await db
    .insert(phdSystemGroup)
    .values({
      name,
      description,
      displayOrder,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: phdSystemGroup.name,
      set: {
        description,
        displayOrder,
        updatedAt: new Date(),
      },
    })
    .returning({ id: phdSystemGroup.id, name: phdSystemGroup.name });

  return row;
}

async function upsertSystemGroupMember(systemGroupId: string, systemId: string, displayOrder: number) {
  const [row] = await db
    .insert(phdSystemGroupMember)
    .values({
      systemGroupId,
      systemId,
      displayOrder,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [phdSystemGroupMember.systemGroupId, phdSystemGroupMember.systemId],
      set: {
        displayOrder,
        updatedAt: new Date(),
      },
    })
    .returning({ id: phdSystemGroupMember.id });

  return row;
}

async function run() {
  console.log("Seeding phd demo data...");

  const before = {
    systems: await countRows("system_entity"),
    subsystems: await countRows("subsystem"),
    systemSubsystems: await countRows("system_subsystem"),
    tags: await countRows("tag"),
    groups: await countRows("system_group"),
    groupMembers: await countRows("system_group_member"),
  };

  const systemsByCode = new Map<string, string>();
  for (const system of SYSTEMS) {
    const row = await upsertSystem(system);
    systemsByCode.set(row.code, row.id);
  }

  const subsystemsByCode = new Map<string, string>();
  for (const subsystem of SUBSYSTEMS) {
    const row = await upsertSubsystem(subsystem);
    subsystemsByCode.set(row.code, row.id);
  }

  const systemSubsystemByCode = new Map<string, string>();
  for (const rel of SYSTEM_SUBSYSTEM_RELATIONS) {
    const systemId = systemsByCode.get(rel.systemCode);
    const subsystemId = subsystemsByCode.get(rel.subsystemCode);

    if (!systemId || !subsystemId) {
      throw new Error(`Missing system/subsystem for relation ${rel.systemCode}/${rel.subsystemCode}`);
    }

    const row = await upsertSystemSubsystem(systemId, subsystemId, rel.displayOrder);
    systemSubsystemByCode.set(`${rel.systemCode}|${rel.subsystemCode}`, row.id);
  }

  for (const tagSeed of TAGS) {
    const systemSubsystemId = systemSubsystemByCode.get(tagSeed.systemSubsystemCode);
    if (!systemSubsystemId) {
      throw new Error(`Missing system_subsystem for tag ${tagSeed.tagname}`);
    }
    await upsertTag(tagSeed, systemSubsystemId);
  }

  const group = await upsertSystemGroup(
    "Oleoductos principales",
    "Agrupacion principal para pruebas del schema phd",
    1
  );

  const primarySystemId = systemsByCode.get("11");
  const secondarySystemId = systemsByCode.get("22");

  if (!primarySystemId || !secondarySystemId) {
    throw new Error("Missing systems for system_group members");
  }

  await upsertSystemGroupMember(group.id, primarySystemId, 1);
  await upsertSystemGroupMember(group.id, secondarySystemId, 2);

  const after = {
    systems: await countRows("system_entity"),
    subsystems: await countRows("subsystem"),
    systemSubsystems: await countRows("system_subsystem"),
    tags: await countRows("tag"),
    groups: await countRows("system_group"),
    groupMembers: await countRows("system_group_member"),
  };

  console.log("before:", before);
  console.log("after:", after);
  console.log("delta:", {
    systems: after.systems - before.systems,
    subsystems: after.subsystems - before.subsystems,
    systemSubsystems: after.systemSubsystems - before.systemSubsystems,
    tags: after.tags - before.tags,
    groups: after.groups - before.groups,
    groupMembers: after.groupMembers - before.groupMembers,
  });

  await pool.end();
}

run().catch(async (error) => {
  console.error("PHD demo seed failed:", error);
  await pool.end();
  process.exit(1);
});
