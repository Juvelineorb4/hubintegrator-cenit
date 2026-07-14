import assert from "node:assert/strict";
import express from "express";

import { and, eq, sql } from "drizzle-orm";
import { appRouter } from "../app.routes";
import { db, pool } from "../core/db/drizzle/client";
import { phdSubsystem, phdSystemEntity, phdSystemSubsystem, phdTag } from "../core/db/drizzle/schema/phd.schema";

type ApiSuccess<T> = {
  success: true;
  data: T;
  total?: number;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type HttpMethod = "GET" | "POST" | "PATCH";

const BASE_URL = "http://127.0.0.1";

function makeCode(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function requestJson<T>(
  method: HttpMethod,
  url: string,
  body?: unknown
): Promise<{ status: number; json: ApiResponse<T> }> {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await response.json()) as ApiResponse<T>;
  return { status: response.status, json };
}

function assertFailure<T>(
  result: { status: number; json: ApiResponse<T> },
  expectedStatus: number,
  expectedMessage?: string
): ApiFailure {
  assert.equal(result.status, expectedStatus);
  assert.equal(result.json.success, false);
  const failure = result.json as ApiFailure;
  if (expectedMessage) {
    assert.equal(failure.message, expectedMessage);
  }
  return failure;
}

function assertSuccess<T>(
  result: { status: number; json: ApiResponse<T> },
  expectedStatus: number
): ApiSuccess<T> {
  assert.equal(result.status, expectedStatus);
  assert.equal(result.json.success, true);
  return result.json as ApiSuccess<T>;
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const app = express();
  app.use(express.json());
  app.use("/api", appRouter);

  const server = await new Promise<import("http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind phase2c test server");
  }

  const baseUrl = `${BASE_URL}:${address.port}/api`;

  try {
    const systemA = assertSuccess(await requestJson<{ id: string; code: string }>("POST", `${baseUrl}/systems`, {
      name: `SYS_${makeCode("A")}`,
      code: makeCode("SYS_A"),
      description: "phase2c system A",
      type: "OLEODUCTO",
    }), 201).data;

    const systemB = assertSuccess(await requestJson<{ id: string; code: string }>("POST", `${baseUrl}/systems`, {
      name: `SYS_${makeCode("B")}`,
      code: makeCode("SYS_B"),
      description: "phase2c system B",
      type: "POLIDUCTO",
    }), 201).data;

    const subA = assertSuccess(await requestJson<{ id: string; code: string }>("POST", `${baseUrl}/sub-systems`, {
      name: `SUB_${makeCode("A")}`,
      code: makeCode("SUB_A"),
      nomenclature: makeCode("NOM_A"),
      description: "phase2c sub A",
      latitude: 7.12,
      longitude: -73.12,
    }), 201).data;

    const subB = assertSuccess(await requestJson<{ id: string; code: string }>("POST", `${baseUrl}/sub-systems`, {
      name: `SUB_${makeCode("B")}`,
      code: makeCode("SUB_B"),
      nomenclature: makeCode("NOM_B"),
      description: "phase2c sub B",
      latitude: 8.12,
      longitude: -74.12,
    }), 201).data;

    const subC = assertSuccess(await requestJson<{ id: string; code: string }>("POST", `${baseUrl}/sub-systems`, {
      name: `SUB_${makeCode("C")}`,
      code: makeCode("SUB_C"),
      nomenclature: makeCode("NOM_C"),
      description: "phase2c sub C",
      latitude: 9.12,
      longitude: -75.12,
    }), 201).data;

    const subD = assertSuccess(await requestJson<{ id: string; code: string }>("POST", `${baseUrl}/sub-systems`, {
      name: `SUB_${makeCode("D")}`,
      code: makeCode("SUB_D"),
      nomenclature: makeCode("NOM_D"),
      description: "phase2c sub D",
      latitude: 10.12,
      longitude: -76.12,
    }), 201).data;

    assertSuccess(await requestJson<{ displayOrder: number }>("POST", `${baseUrl}/sub-systems/relations`, {
      systemId: systemA.id,
      subSystemId: subA.id,
      displayOrder: 1,
    }), 201).data;

    assertSuccess(await requestJson<{ displayOrder: number }>("POST", `${baseUrl}/sub-systems/relations`, {
      systemId: systemA.id,
      subSystemId: subB.id,
      displayOrder: 2,
    }), 201).data;

    assertSuccess(await requestJson<{ displayOrder: number }>("POST", `${baseUrl}/sub-systems/relations`, {
      systemId: systemB.id,
      subSystemId: subC.id,
      displayOrder: 1,
    }), 201).data;

    const [relationA] = await db
      .select({ id: phdSystemSubsystem.id })
      .from(phdSystemSubsystem)
      .where(and(eq(phdSystemSubsystem.systemId, systemA.id), eq(phdSystemSubsystem.subsystemId, subA.id)))
      .limit(1);

    const [relationB] = await db
      .select({ id: phdSystemSubsystem.id })
      .from(phdSystemSubsystem)
      .where(and(eq(phdSystemSubsystem.systemId, systemA.id), eq(phdSystemSubsystem.subsystemId, subB.id)))
      .limit(1);

    const [relationC] = await db
      .select({ id: phdSystemSubsystem.id })
      .from(phdSystemSubsystem)
      .where(and(eq(phdSystemSubsystem.systemId, systemB.id), eq(phdSystemSubsystem.subsystemId, subC.id)))
      .limit(1);

    assert.ok(relationA?.id);
    assert.ok(relationB?.id);
    assert.ok(relationC?.id);

    const systemPatch = await requestJson<{ id: string; code: string; type: string; distance: string | null }>(
      "PATCH",
      `${baseUrl}/systems/${systemA.id}`,
      {
        code: makeCode("SYS_A_PATCH"),
        type: "POLIDUCTO",
        distance: 123.45,
      }
    );
    const patchedSystem = assertSuccess(systemPatch, 200).data;
    assert.equal(patchedSystem.type, "PRODUCT_PIPELINE");

    const systemPatchMissing = await requestJson("PATCH", `${baseUrl}/systems/00000000-0000-0000-0000-000000000001`, {
      code: makeCode("SYS_MISS"),
    });
    assertFailure(systemPatchMissing, 404, "System not found");

    const systemPatchInvalidType = await requestJson("PATCH", `${baseUrl}/systems/${systemA.id}`, {
      type: "INVALID",
    });
    assertFailure(systemPatchInvalidType, 400, "Invalid system type");

    const systemPatchConflict = await requestJson("PATCH", `${baseUrl}/systems/${systemA.id}`, {
      code: systemB.code,
    });
    assertFailure(systemPatchConflict, 409, "System already exists");

    const subPatch = await requestJson<{ id: string; nomenclature: string }>("PATCH", `${baseUrl}/sub-systems/${subA.id}`, {
      nomenclature: makeCode("NOM_PATCH"),
      latitude: 11.11,
    });
    const patchedSub = assertSuccess(subPatch, 200).data;
    assert.ok(patchedSub.nomenclature.startsWith("NOM_PATCH_"));

    const subPatchMissing = await requestJson("PATCH", `${baseUrl}/sub-systems/00000000-0000-0000-0000-000000000002`, {
      code: makeCode("SUB_MISS"),
    });
    assertFailure(subPatchMissing, 404, "Sub-system not found");

    const subPatchConflict = await requestJson("PATCH", `${baseUrl}/sub-systems/${subA.id}`, {
      code: subB.code,
    });
    assertFailure(subPatchConflict, 409, "Sub-system already exists");

    const relationPatchOrder = await requestJson<{ id: string; displayOrder: number }>(
      "PATCH",
      `${baseUrl}/sub-systems/relations/${relationA!.id}`,
      {
        displayOrder: 10,
      }
    );
    const relationOrderBody = assertSuccess(relationPatchOrder, 200).data;
    assert.equal(relationOrderBody.displayOrder, 10);

    const relationPatchPair = await requestJson<{ id: string; systemId: string; subSystemId: string }>(
      "PATCH",
      `${baseUrl}/sub-systems/relations/${relationA!.id}`,
      {
        systemId: systemB.id,
        subSystemId: subD.id,
      }
    );
    const relationPairBody = assertSuccess(relationPatchPair, 200).data;
    assert.equal(relationPairBody.systemId, systemB.id);
    assert.equal(relationPairBody.subSystemId, subD.id);

    const relationPatchInvalidPairPayload = await requestJson(
      "PATCH",
      `${baseUrl}/sub-systems/relations/${relationA!.id}`,
      {
        systemId: systemA.id,
      }
    );
    assertFailure(relationPatchInvalidPairPayload, 400, "systemId and subSystemId must be provided together");

    const relationPatchMissing = await requestJson(
      "PATCH",
      `${baseUrl}/sub-systems/relations/00000000-0000-0000-0000-000000000003`,
      {
        displayOrder: 99,
      }
    );
    assertFailure(relationPatchMissing, 404, "System/sub-system relation not found");

    const relationPatchSystemMissing = await requestJson(
      "PATCH",
      `${baseUrl}/sub-systems/relations/${relationA!.id}`,
      {
        systemId: "00000000-0000-0000-0000-000000000004",
        subSystemId: subA.id,
      }
    );
    assertFailure(relationPatchSystemMissing, 404, "System not found");

    const relationPatchConflict = await requestJson(
      "PATCH",
      `${baseUrl}/sub-systems/relations/${relationB!.id}`,
      {
        systemId: systemB.id,
        subSystemId: subC.id,
      }
    );
    assertFailure(relationPatchConflict, 409, "System/sub-system relation already exists");

    const tagA = assertSuccess(await requestJson<{ id: string; tagname: string }>("POST", `${baseUrl}/tags`, {
      tagname: makeCode("TAG_A"),
      description: "phase2c tag A",
      category: "FLOW_IN",
      phdTagno: makeCode("TAGNO_A"),
      phdUnit: "BPH",
      phdDataTypeName: "DOUBLE",
      phdAssetName: "asset_a",
      phdDescription: "desc a",
      systemId: systemA.id,
      subSystemId: subB.id,
    }), 201).data;

    const tagB = assertSuccess(await requestJson<{ id: string; tagname: string }>("POST", `${baseUrl}/tags`, {
      tagname: makeCode("TAG_B"),
      description: "phase2c tag B",
      category: "FLOW_OUT",
      phdTagno: makeCode("TAGNO_B"),
      phdUnit: "BPH",
      phdDataTypeName: "DOUBLE",
      phdAssetName: "asset_b",
      phdDescription: "desc b",
      systemId: systemA.id,
      subSystemId: subB.id,
    }), 201).data;

    const tagPatchSuccess = await requestJson<{ id: string; category: string; systemId: string; subSystemId: string }>(
      "PATCH",
      `${baseUrl}/tags/${tagA.id}`,
      {
        tagname: makeCode("TAG_A_PATCH"),
        category: "PRESSURE_OUT_MAX",
        phdDataTypeName: "FLOAT",
        phdUnit: "PSI",
        systemId: systemB.id,
        subSystemId: subC.id,
      }
    );
    const patchedTag = assertSuccess(tagPatchSuccess, 200).data;
    assert.equal(patchedTag.category, "PRESSURE_OUT_MAX");
    assert.equal(patchedTag.systemId, systemB.id);
    assert.equal(patchedTag.subSystemId, subC.id);

    const tagPatchMissing = await requestJson(
      "PATCH",
      `${baseUrl}/tags/00000000-0000-0000-0000-000000000005`,
      { tagname: makeCode("TAG_MISS") }
    );
    assertFailure(tagPatchMissing, 404, "Tag not found");

    const tagPatchInvalidCategory = await requestJson("PATCH", `${baseUrl}/tags/${tagA.id}`, {
      category: "FLOW",
    });
    assertFailure(tagPatchInvalidCategory, 400, "Invalid tag category");

    const tagPatchInvalidDataType = await requestJson("PATCH", `${baseUrl}/tags/${tagA.id}`, {
      phdDataTypeName: "DECIMAL",
    });
    assertFailure(tagPatchInvalidDataType, 400, "Invalid phdDataTypeName");

    const tagPatchInvalidRelationPayload = await requestJson("PATCH", `${baseUrl}/tags/${tagA.id}`, {
      systemId: systemA.id,
    });
    assertFailure(tagPatchInvalidRelationPayload, 400, "systemId and subSystemId must be provided together");

    const tagPatchRelationMissing = await requestJson("PATCH", `${baseUrl}/tags/${tagA.id}`, {
      systemId: systemA.id,
      subSystemId: subD.id,
    });
    assertFailure(tagPatchRelationMissing, 404, "Sub-system relation not found");

    const tagPatchConflict = await requestJson("PATCH", `${baseUrl}/tags/${tagA.id}`, {
      tagname: tagB.tagname,
    });
    assertFailure(tagPatchConflict, 409, "Tag already exists");

    const verifyUpdates = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM phd.system_entity WHERE id = ${systemA.id}) AS phd_system_count,
        (SELECT COUNT(*)::int FROM phd.subsystem WHERE id = ${subA.id}) AS phd_subsystem_count,
        (SELECT COUNT(*)::int FROM phd.system_subsystem WHERE id = ${relationA!.id}) AS phd_relation_count,
        (SELECT COUNT(*)::int FROM phd.tag WHERE id = ${tagA.id}) AS phd_tag_count,
        (SELECT COUNT(*)::int
           FROM information_schema.columns
          WHERE table_schema = 'phd'
            AND table_name = 'tag'
            AND column_name IN ('category', 'system_id', 'subsystem_id')) AS legacy_columns_on_phd_tag,
        (SELECT COUNT(*)::int
           FROM phd.tag t
      LEFT JOIN phd.system_subsystem ss ON ss.id = t.system_subsystem_id
          WHERE ss.id IS NULL) AS orphan_tags
    `);

    const verifyRow = verifyUpdates.rows[0] as {
      phd_system_count: number;
      phd_subsystem_count: number;
      phd_relation_count: number;
      phd_tag_count: number;
      legacy_columns_on_phd_tag: number;
      orphan_tags: number;
    };

    assert.equal(Number(verifyRow.phd_system_count), 1);
    assert.equal(Number(verifyRow.phd_subsystem_count), 1);
    assert.equal(Number(verifyRow.phd_relation_count), 1);
    assert.equal(Number(verifyRow.phd_tag_count), 1);
    assert.equal(Number(verifyRow.legacy_columns_on_phd_tag), 0);
    assert.equal(Number(verifyRow.orphan_tags), 0);

    const relationRow = await db
      .select({ systemId: phdSystemSubsystem.systemId, subSystemId: phdSystemSubsystem.subsystemId })
      .from(phdSystemSubsystem)
      .where(eq(phdSystemSubsystem.id, relationA!.id));
    assert.equal(relationRow[0]?.systemId, systemB.id);
    assert.equal(relationRow[0]?.subSystemId, subD.id);

    const tagRow = await db
      .select({
        measurementType: phdTag.measurementType,
        role: phdTag.role,
        qualifier: phdTag.qualifier,
        phdDataType: phdTag.phdDataType,
      })
      .from(phdTag)
      .where(and(eq(phdTag.id, tagA.id), eq(phdTag.phdDataType, "FLOAT")));

    assert.equal(tagRow.length, 1);
    assert.equal(tagRow[0]?.measurementType, "PRESSURE");
    assert.equal(tagRow[0]?.role, "OUT");
    assert.equal(tagRow[0]?.qualifier, "MAX");

    const publicWriteCheck = await pool.query(`
      SELECT
        to_regclass('public.system_entity') AS public_system_table,
        to_regclass('public.sub_system') AS public_subsystem_table,
        to_regclass('public.system_sub_system') AS public_relation_table,
        to_regclass('public.tag') AS public_tag_table
    `);

    const publicRow = publicWriteCheck.rows[0] as {
      public_system_table: string | null;
      public_subsystem_table: string | null;
      public_relation_table: string | null;
      public_tag_table: string | null;
    };

    assert.equal(publicRow.public_system_table, null);
    assert.equal(publicRow.public_subsystem_table, null);
    assert.equal(publicRow.public_relation_table, null);
    assert.equal(publicRow.public_tag_table, null);

    console.log("phase2c-http-errors", JSON.stringify({
      systemInvalidType: systemPatchInvalidType.status,
      systemConflict: systemPatchConflict.status,
      relationInvalidPairPayload: relationPatchInvalidPairPayload.status,
      relationConflict: relationPatchConflict.status,
      tagInvalidCategory: tagPatchInvalidCategory.status,
      tagInvalidDataType: tagPatchInvalidDataType.status,
      tagRelationMissing: tagPatchRelationMissing.status,
      tagConflict: tagPatchConflict.status,
    }));

    console.log("phase2c-update.integration: OK");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

run().catch((error) => {
  console.error("phase2c-update.integration: FAILED", error);
  process.exit(1);
});
