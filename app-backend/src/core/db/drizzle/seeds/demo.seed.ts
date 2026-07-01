import { db, pool } from "../client";
import { systemEntity } from "../schema/system-entity.schema";
import { subSystem } from "../schema/sub-system.schema";
import { systemSubSystem } from "../schema/system-sub-system.schema";
import { tag } from "../schema/tag.schema";

async function run() {
  console.log("Seeding demo data...");

  // ── 1. System Entity ───────────────────────────────────────────────────────
  const [system] = await db
    .insert(systemEntity)
    .values({
      name:        "Pozos - Galan L.14",
      code:        "11",
      description: "Pozos - Galan L.14",
      distance:    "0",
      type:        "POLIDUCTO",
    })
    .returning();

  console.log(`  ✔ system_entity     → ${system.id}  (${system.code})`);

  // ── 2. Sub-system ──────────────────────────────────────────────────────────
  const [sub] = await db
    .insert(subSystem)
    .values({
      name:         "Pozos",
      code:         "149",
      description:  "Pozos",
      nomenclature: "POZ",
      latitude:     "11.1683177",
      longitude:    "-74.225995",
    })
    .returning();

  console.log(`  ✔ sub_system        → ${sub.id}  (${sub.code})`);

  // ── 3. System ↔ Sub-system relation ───────────────────────────────────────
  const [relation] = await db
    .insert(systemSubSystem)
    .values({
      systemId:          system.id,
      subSystemId:       sub.id,
      subsystemSequence: 1,
    })
    .returning();

  console.log(`  ✔ system_sub_system → ${relation.id}`);

  // ── 4. Tag ────────────────────────────────────────────────────────────────
  const [tagRow] = await db
    .insert(tag)
    .values({
      tagname:         "POZ_FIC_1311",
      description:     "POZ_FIC_1311",
      category:        "FLOW",
      phdTagno:        "37702",
      phdUnit:         "BPH",
      phdDataTypeName: "FLOAT",
      phdAssetName:    "l_galpoz",
      systemId:        system.id,
      subSystemId:     sub.id,
    })
    .returning();

  console.log(`  ✔ tag               → ${tagRow.id}  (${tagRow.phdTagno})`);

  console.log("\nDemo seed complete.");
  await pool.end();
}

run().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
