import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  phdSystemEntity,
  phdSystemEntityRelations,
  phdSystemGroup,
  phdSystemGroupMember,
  phdSystemGroupMemberRelations,
  phdSystemGroupRelations,
  phdSubsystem,
  phdSubsystemRelations,
  phdSystemSubsystem,
  phdSystemSubsystemRelations,
  phdTag,
  phdTagRelations,
} from "../src/core/db/drizzle/schema/phd.schema";

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, {
    schema: {
      phdSystemEntity,
      phdSystemEntityRelations,
      phdSubsystem,
      phdSubsystemRelations,
      phdSystemSubsystem,
      phdSystemSubsystemRelations,
      phdTag,
      phdTagRelations,
      phdSystemGroup,
      phdSystemGroupRelations,
      phdSystemGroupMember,
      phdSystemGroupMemberRelations,
    },
  });

  const systems = await db.query.phdSystemEntity.findMany({
    with: {
      systemSubsystems: {
        with: {
          subsystem: true,
          tags: true,
        },
      },
      systemGroupMembers: true,
    },
    orderBy: (table, { asc }) => [asc(table.code)],
  });

  const groups = await db.query.phdSystemGroup.findMany({
    with: {
      members: {
        with: {
          systemEntity: true,
        },
      },
    },
    orderBy: (table, { asc }) => [asc(table.displayOrder)],
  });

  console.log("systems relation tree:");
  for (const system of systems) {
    console.log(`- system ${system.code} (${system.name})`);
    for (const rel of system.systemSubsystems) {
      console.log(`  - subsystem ${rel.subsystem.code} order=${rel.displayOrder} tags=${rel.tags.length}`);
    }
  }

  console.log("groups relation tree:");
  for (const group of groups) {
    console.log(`- group ${group.name} members=${group.members.length}`);
    const sortedMembers = [...group.members].sort((a, b) => a.displayOrder - b.displayOrder);
    for (const member of sortedMembers) {
      console.log(`  - member order=${member.displayOrder} system=${member.systemEntity.code}`);
    }
  }

  await pool.end();
}

run().catch((error) => {
  console.error("verify-phd-relations failed:", error);
  process.exit(1);
});
