import { and, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  phdSubsystem,
  phdSystemEntity,
  phdSystemSubsystem,
  phdTag,
} from "../src/core/db/drizzle/schema/phd.schema";

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const [system11] = await db
    .select({ id: phdSystemEntity.id })
    .from(phdSystemEntity)
    .where(eq(phdSystemEntity.code, "11"))
    .limit(1);

  const [subsystemAya] = await db
    .select({ id: phdSubsystem.id })
    .from(phdSubsystem)
    .where(eq(phdSubsystem.code, "AYA"))
    .limit(1);

  const [relAya] = await db
    .select({ id: phdSystemSubsystem.id })
    .from(phdSystemSubsystem)
    .where(and(eq(phdSystemSubsystem.systemId, system11.id), eq(phdSystemSubsystem.subsystemId, subsystemAya.id)))
    .limit(1);

  const qBySystemId = db
    .select({
      id: phdTag.id,
      tagname: phdTag.tagname,
    })
    .from(phdTag)
    .innerJoin(phdSystemSubsystem, eq(phdTag.systemSubsystemId, phdSystemSubsystem.id))
    .where(eq(phdSystemSubsystem.systemId, system11.id));

  const qBySubsystemId = db
    .select({
      id: phdTag.id,
      tagname: phdTag.tagname,
    })
    .from(phdTag)
    .innerJoin(phdSystemSubsystem, eq(phdTag.systemSubsystemId, phdSystemSubsystem.id))
    .where(eq(phdSystemSubsystem.subsystemId, subsystemAya.id));

  const qByComposite = db
    .select({
      id: phdTag.id,
      tagname: phdTag.tagname,
    })
    .from(phdTag)
    .where(
      and(
        eq(phdTag.systemSubsystemId, relAya.id),
        eq(phdTag.measurementType, "PRESSURE"),
        or(
          and(eq(phdTag.role, "OUT"), eq(phdTag.qualifier, "NORMAL")),
          and(eq(phdTag.role, "OUT"), eq(phdTag.qualifier, "MAX"))
        )
      )
    );

  const sqlBySystemId = qBySystemId.toSQL();
  const sqlBySubsystemId = qBySubsystemId.toSQL();
  const sqlByComposite = qByComposite.toSQL();

  console.log("DRIZZLE_SQL tags_by_system_id", JSON.stringify(sqlBySystemId, null, 2));
  console.log("DRIZZLE_SQL tags_by_subsystem_id", JSON.stringify(sqlBySubsystemId, null, 2));
  console.log("DRIZZLE_SQL tags_by_syssub_measurement_role_qualifier", JSON.stringify(sqlByComposite, null, 2));

  async function explain(name: string, queryText: string, params: unknown[]) {
    const result = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${queryText}`,
      params as never[]
    );

    const lines = result.rows.map((row) => String(row["QUERY PLAN"]));
    const joined = lines.join("\n");

    console.log(`EXPLAIN_ANALYZE ${name}`);
    console.log(joined);
    console.log(`INDEX_USAGE ${name} uq_phd_system_subsystem_pair=${joined.includes("uq_phd_system_subsystem_pair")}`);
    console.log(`INDEX_USAGE ${name} idx_phd_system_subsystem_subsystem_id=${joined.includes("idx_phd_system_subsystem_subsystem_id")}`);
    console.log(
      `INDEX_USAGE ${name} idx_phd_tag_syssub_measurement_role_qualifier=${joined.includes("idx_phd_tag_syssub_measurement_role_qualifier")}`
    );
  }

  await explain("tags_by_system_id", sqlBySystemId.sql, sqlBySystemId.params);
  await explain("tags_by_subsystem_id", sqlBySubsystemId.sql, sqlBySubsystemId.params);
  await explain("tags_by_syssub_measurement_role_qualifier", sqlByComposite.sql, sqlByComposite.params);

  await pool.end();
}

run().catch((error) => {
  console.error("phase2a-explain failed:", error);
  process.exit(1);
});
