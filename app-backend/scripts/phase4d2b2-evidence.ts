import express from "express";
import { sql } from "drizzle-orm";

import { appRouter } from "../src/app.routes";
import { db, pool } from "../src/core/db/drizzle/client";

const EXPECTED_DB = "industrial_integration_hub_dev";

type JsonResponse = {
  success?: boolean;
  data?: unknown[];
  total?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function dbNameFromUrl(urlValue: string): string {
  const parsed = new URL(urlValue);
  return parsed.pathname.replace(/^\//, "");
}

async function fetchJson(url: string): Promise<{ status: number; body: JsonResponse }> {
  const response = await fetch(url);
  const body = (await response.json()) as JsonResponse;
  return { status: response.status, body };
}

async function fetch404Text(url: string): Promise<{ status: number; bodyText: string }> {
  const response = await fetch(url);
  const bodyText = await response.text();
  return { status: response.status, bodyText };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  assert(databaseUrl, "DATABASE_URL is missing");
  const expectedFromUrl = dbNameFromUrl(databaseUrl);
  assert(expectedFromUrl === EXPECTED_DB, `DATABASE_URL must target ${EXPECTED_DB}; got ${expectedFromUrl}`);

  const currentDbRow = await db.execute(sql`SELECT current_database() AS db_name`);
  const connectedDb = String((currentDbRow.rows[0] as { db_name: string }).db_name);
  assert(connectedDb === EXPECTED_DB, `Connected DB must be ${EXPECTED_DB}; got ${connectedDb}`);

  const countsRow = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM phd.system_entity) AS system_entity,
      (SELECT COUNT(*)::int FROM phd.subsystem) AS subsystem,
      (SELECT COUNT(*)::int FROM phd.system_subsystem) AS system_subsystem,
      (SELECT COUNT(*)::int FROM phd.tag) AS tag,
      (SELECT COUNT(*)::int FROM phd.system_group) AS system_group,
      (SELECT COUNT(*)::int FROM phd.system_group_member) AS system_group_member
  `);
  const counts = countsRow.rows[0] as Record<string, number>;

  assert(counts.system_entity === 5, `Expected 5 systems, got ${counts.system_entity}`);
  assert(counts.subsystem === 9, `Expected 9 subsystems, got ${counts.subsystem}`);
  assert(counts.system_subsystem === 17, `Expected 17 relations, got ${counts.system_subsystem}`);
  assert(counts.tag === 17, `Expected 17 tags, got ${counts.tag}`);
  assert(counts.system_group === 0, `Expected 0 system groups, got ${counts.system_group}`);
  assert(counts.system_group_member === 0, `Expected 0 group members, got ${counts.system_group_member}`);

  const app = express();
  app.use(express.json());
  app.use("/api", appRouter);

  const server = await new Promise<import("http").Server>((resolveServer) => {
    const instance = app.listen(0, () => resolveServer(instance));
  });

  try {
    const address = server.address();
    assert(address && typeof address !== "string", "Failed to bind temporary server");
    const apiBase = `http://127.0.0.1:${address.port}/api`;

    const systems = await fetchJson(`${apiBase}/systems`);
    assert(systems.status === 200, `GET /api/systems expected 200, got ${systems.status}`);

    const subSystems = await fetchJson(`${apiBase}/sub-systems`);
    assert(subSystems.status === 200, `GET /api/sub-systems expected 200, got ${subSystems.status}`);

    const groups = await fetchJson(`${apiBase}/system-groups`);
    assert(groups.status === 200, `GET /api/system-groups expected 200, got ${groups.status}`);

    const systemCodes = ((systems.body.data ?? []) as Array<{ code: string }>).map((row) => row.code);
    const tagsBySystem: Array<{
      systemCode: string;
      pressure: number;
      flowInTags: number;
      flowOutTags: number;
      selectorTags: number;
      flowEndpointTotal: number;
      selectorEndpointTotal: number;
      volume: number;
    }> = [];

    for (const systemCode of systemCodes) {
      const pressure = await fetchJson(`${apiBase}/tags/pressure?systemCode=${encodeURIComponent(systemCode)}`);
      const flow = await fetchJson(`${apiBase}/tags/flow?systemCode=${encodeURIComponent(systemCode)}`);
      const selector = await fetchJson(`${apiBase}/tags/selector?systemCode=${encodeURIComponent(systemCode)}`);
      const volume = await fetchJson(`${apiBase}/tags/volume?systemCode=${encodeURIComponent(systemCode)}`);

      assert(pressure.status === 200, `GET /api/tags/pressure expected 200 for ${systemCode}, got ${pressure.status}`);
      assert(flow.status === 200, `GET /api/tags/flow expected 200 for ${systemCode}, got ${flow.status}`);
      assert(selector.status === 200, `GET /api/tags/selector expected 200 for ${systemCode}, got ${selector.status}`);
      assert(volume.status === 200, `GET /api/tags/volume expected 200 for ${systemCode}, got ${volume.status}`);

      const flowRows = (flow.body.data ?? []) as Array<{ category?: string }>;
      const selectorRows = (selector.body.data ?? []) as Array<{ category?: string }>;

      tagsBySystem.push({
        systemCode,
        pressure: (pressure.body.data ?? []).length,
        flowInTags: flowRows.filter((row) => row.category === "FLOW_IN").length,
        flowOutTags: flowRows.filter((row) => row.category === "FLOW_OUT").length,
        selectorTags: flowRows.filter((row) => row.category === "SELECTOR_S_E").length,
        flowEndpointTotal: flowRows.length,
        selectorEndpointTotal: selectorRows.length,
        volume: (volume.body.data ?? []).length,
      });
    }

    const tagValuesRaw = await fetch404Text(`${apiBase}/tag-values/raw`);
    assert(tagValuesRaw.status === 404, `GET /api/tag-values/raw expected 404, got ${tagValuesRaw.status}`);

    console.log(
      JSON.stringify(
        {
          phase: "4D2B2",
          timestampUtc: new Date().toISOString(),
          database: connectedDb,
          counts,
          http: {
            systemsStatus: systems.status,
            subSystemsStatus: subSystems.status,
            groupsStatus: groups.status,
            tagValuesRawStatus: tagValuesRaw.status,
            tagValuesRawEvidence: tagValuesRaw.bodyText.slice(0, 200),
            tagsBySystem,
          },
          scriptFinished: true,
        },
        null,
        2
      )
    );
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
