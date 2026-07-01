import { sql } from "drizzle-orm";
import { db, pool } from "../client";

// ── Configure the range of monthly partitions to create ──────────────────────
const FROM = { year: 2024, month: 1 };
const TO   = { year: 2026, month: 12 };
// ─────────────────────────────────────────────────────────────────────────────

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function buildBounds(year: number, month: number) {
  const mm     = String(month).padStart(2, "0");
  const next   = nextMonth(year, month);
  const nextMm = String(next.month).padStart(2, "0");
  return {
    tableName: `tag_value_${year}_${mm}`,
    from:      `${year}-${mm}-01`,
    to:        `${next.year}-${nextMm}-01`,
  };
}

/** Creates a single monthly partition (idempotent). */
export async function createMonthPartition(year: number, month: number) {
  if (month < 1 || month > 12) throw new RangeError(`month must be 1-12, got ${month}`);
  const { tableName, from, to } = buildBounds(year, month);
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${tableName}
      PARTITION OF tag_value FOR VALUES FROM ('${from}') TO ('${to}')
  `));
  await db.execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS idx_${tableName}
      ON ${tableName} USING btree (tag_id, "timestamp")
  `));
  console.log(`  ✔ ${tableName}  [${from} → ${to}]`);
}

/** Creates monthly partitions for every month in the range (both inclusive). */
export async function createPartitionRange(
  from: { year: number; month: number },
  to:   { year: number; month: number }
) {
  let cur = { ...from };
  while (cur.year < to.year || (cur.year === to.year && cur.month <= to.month)) {
    await createMonthPartition(cur.year, cur.month);
    cur = nextMonth(cur.year, cur.month);
  }
}

// ── Run when called directly via pnpm seed:partitions ────────────────────────
async function run() {
  const fromLabel = `${FROM.year}-${String(FROM.month).padStart(2, "0")}`;
  const toLabel   = `${TO.year}-${String(TO.month).padStart(2, "0")}`;
  console.log(`Creating tag_value partitions [${fromLabel} → ${toLabel}]...`);
  await createPartitionRange(FROM, TO);
  console.log("\nDone.");
  await pool.end();
}

if (require.main === module) {
  run().catch((error) => {
    console.error("Seed error:", error);
    process.exit(1);
  });
}
