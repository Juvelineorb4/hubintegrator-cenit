import { pool } from "./client";
import { createMonthPartition } from "./seeds/partitions.seed";

/**
 * Creates the `tag_value` partitioned table, a default safety partition,
 * and a partition for the current calendar month.
 *
 * Runs automatically after `pnpm db:push` (chained in package.json).
 * Fully idempotent — safe to run multiple times.
 */
async function setup() {
  const client = await pool.connect();
  try {
    console.log("Setting up tag_value partitioned table...");

    // Create the parent partitioned table if it doesn't already exist.
    await client.query(`
      CREATE TABLE IF NOT EXISTS tag_value (
        id            bigserial,
        tag_id        uuid              NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
        value_double  double precision,
        value_text    text,
        value_boolean boolean,
        value_binary  bytea,
        "timestamp"   timestamptz       NOT NULL,
        PRIMARY KEY (id, "timestamp"),
        CONSTRAINT check_single_value CHECK (
          (value_double  IS NOT NULL)::int +
          (value_text    IS NOT NULL)::int +
          (value_boolean IS NOT NULL)::int +
          (value_binary  IS NOT NULL)::int = 1
        )
      ) PARTITION BY RANGE ("timestamp")
    `);
    console.log("  ✔ tag_value (partitioned by timestamp)");

    // Idempotency constraint: prevents duplicate (tag_id, timestamp) rows.
    // Enables ON CONFLICT DO NOTHING in the ETL bulk insert.
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'uq_tag_value_tag_timestamp'
        ) THEN
          ALTER TABLE tag_value
          ADD CONSTRAINT uq_tag_value_tag_timestamp UNIQUE (tag_id, "timestamp");
        END IF;
      END $$
    `);
    console.log("  ✔ uq_tag_value_tag_timestamp (idempotency constraint)");

    // Default partition catches rows outside all explicit monthly partitions.
    await client.query(`
      CREATE TABLE IF NOT EXISTS tag_value_default
        PARTITION OF tag_value DEFAULT
    `);
    console.log("  ✔ tag_value_default (default partition)");

    // Trigger: auto-create tag_etl_state row on every tag insert.
    // - batch_number: ceil((existing_count + 1) / 50) → groups of 50
    // - last_loaded_data_timestamp: historization_from if set, else first day of current month at midnight
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_create_tag_etl_state()
      RETURNS trigger AS $$
      DECLARE
        v_batch int;
        v_start timestamptz;
      BEGIN
        SELECT ceil((count(*) + 1) / 50.0)::int
        INTO v_batch
        FROM tag_etl_state;

        v_start := COALESCE(
          NEW.historization_from,
          date_trunc('month', now()) AT TIME ZONE 'UTC'
        );

        INSERT INTO tag_etl_state (tag_id, batch_number, last_loaded_data_timestamp)
        VALUES (NEW.id, v_batch, v_start);

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log("  ✔ fn_create_tag_etl_state (trigger function)");

    await client.query(`
      DROP TRIGGER IF EXISTS trg_tag_etl_state_on_insert ON tag;
      CREATE TRIGGER trg_tag_etl_state_on_insert
      AFTER INSERT ON tag
      FOR EACH ROW EXECUTE FUNCTION fn_create_tag_etl_state();
    `);
    console.log("  ✔ trg_tag_etl_state_on_insert (trigger)");

    // Trigger: enforce that the correct value column is populated in tag_value
    // based on the tag's phd_data_type_name:
    //   DOUBLE | FLOAT | INTEGER → value_double
    //   STRING                  → value_text
    //   BOOLEAN                 → value_boolean
    //   BINARY                  → value_binary
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_check_tag_value_column()
      RETURNS trigger AS $$
      DECLARE
        v_dtype phd_type;
      BEGIN
        SELECT phd_data_type_name INTO v_dtype FROM tag WHERE id = NEW.tag_id;

        IF v_dtype IN ('DOUBLE', 'FLOAT', 'INTEGER') THEN
          IF NEW.value_double IS NULL THEN
            RAISE EXCEPTION
              'tag type % requires value_double (tag_id=%)', v_dtype, NEW.tag_id;
          END IF;
        ELSIF v_dtype = 'STRING' THEN
          IF NEW.value_text IS NULL THEN
            RAISE EXCEPTION
              'tag type STRING requires value_text (tag_id=%)', NEW.tag_id;
          END IF;
        ELSIF v_dtype = 'BOOLEAN' THEN
          IF NEW.value_boolean IS NULL THEN
            RAISE EXCEPTION
              'tag type BOOLEAN requires value_boolean (tag_id=%)', NEW.tag_id;
          END IF;
        ELSIF v_dtype = 'BINARY' THEN
          IF NEW.value_binary IS NULL THEN
            RAISE EXCEPTION
              'tag type BINARY requires value_binary (tag_id=%)', NEW.tag_id;
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log("  ✔ fn_check_tag_value_column (trigger function)");

    await client.query(`
      DROP TRIGGER IF EXISTS trg_check_tag_value_column ON tag_value;
      CREATE TRIGGER trg_check_tag_value_column
      BEFORE INSERT OR UPDATE ON tag_value
      FOR EACH ROW EXECUTE FUNCTION fn_check_tag_value_column();
    `);
    console.log("  ✔ trg_check_tag_value_column (trigger)");

    client.release();

    // Create a partition for the current month so the table is immediately usable.
    const now = new Date();
    await createMonthPartition(now.getFullYear(), now.getMonth() + 1);

    console.log("\nSetup complete.");
  } catch (err) {
    client.release();
    throw err;
  } finally {
    await pool.end();
  }
}

setup().catch((error) => {
  console.error("Setup error:", error);
  process.exit(1);
});