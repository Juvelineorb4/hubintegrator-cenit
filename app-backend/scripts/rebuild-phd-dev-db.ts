import { Client } from "pg";

const ALLOWLIST = new Set(["industrial_integration_hub_dev"]);

function getTargetDatabaseName(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!dbName) {
    throw new Error("DATABASE_URL must include a database name");
  }
  return dbName;
}

function buildAdminUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  parsed.pathname = "/postgres";
  return parsed.toString();
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const targetDb = getTargetDatabaseName(databaseUrl);
  console.log(`[rebuild-dev] DATABASE_URL target db: ${targetDb}`);

  if (!ALLOWLIST.has(targetDb)) {
    throw new Error(
      `[rebuild-dev] Refusing destructive operation. Target db '${targetDb}' is not in allowlist: ${Array.from(ALLOWLIST).join(", ")}`
    );
  }

  const adminClient = new Client({ connectionString: buildAdminUrl(databaseUrl) });
  await adminClient.connect();

  try {
    const dbsBefore = await adminClient.query<{ datname: string }>(
      "select datname from pg_database where datname in ('industrial_integration_hub_test', 'industrial_integration_hub_dev', 'industrial_integration_hub') order by datname"
    );
    console.log("[rebuild-dev] dbs before:", dbsBefore.rows.map((r) => r.datname));

    await adminClient.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [targetDb]
    );
    console.log(`[rebuild-dev] terminated active sessions for ${targetDb}`);

    await adminClient.query(`drop database if exists "${targetDb}"`);
    console.log(`[rebuild-dev] dropped database ${targetDb}`);

    await adminClient.query(`create database "${targetDb}"`);
    console.log(`[rebuild-dev] created database ${targetDb}`);

    const dbsAfter = await adminClient.query<{ datname: string }>(
      "select datname from pg_database where datname in ('industrial_integration_hub_test', 'industrial_integration_hub_dev', 'industrial_integration_hub') order by datname"
    );
    console.log("[rebuild-dev] dbs after:", dbsAfter.rows.map((r) => r.datname));
  } finally {
    await adminClient.end();
  }
}

run().catch((error) => {
  console.error("[rebuild-dev] failed:", error);
  process.exit(1);
});