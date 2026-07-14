import assert from "node:assert/strict";
import express from "express";

import { appRouter } from "../app.routes";
import { db, pool } from "../core/db/drizzle/client";
import { and, eq, sql } from "drizzle-orm";
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

type SystemPayload = {
  name: string;
  code: string;
  description?: string;
  distance?: number;
  type?: string;
};

type SubSystemPayload = {
  name: string;
  code: string;
  description?: string;
  nomenclature: string;
  latitude?: number;
  longitude?: number;
};

type RelationPayload = {
  systemId: string;
  subSystemId: string;
  displayOrder?: number;
};

type TagPayload = {
  tagname: string;
  description?: string;
  category: string;
  phdTagno: string;
  phdUnit?: string;
  phdDataTypeName: string;
  phdAssetName?: string;
  phdDescription?: string;
  systemId: string;
  subSystemId: string;
};

const BASE_URL = "http://127.0.0.1";

function makeCode(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function requestJson<T>(
  method: "GET" | "POST",
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
    throw new Error("Failed to bind phase2b test server");
  }

  const baseUrl = `${BASE_URL}:${address.port}/api`;

  try {
    const systemPayload: SystemPayload = {
      name: `SYS_${makeCode("NAME")}`,
      code: makeCode("SYS"),
      description: "Phase2B system create",
      distance: 101.5,
      type: "OLEODUCTO",
    };

    const systemCreate = await requestJson<{ id: string; code: string; name: string; type: string }>(
      "POST",
      `${baseUrl}/systems`,
      systemPayload
    );
    const systemCreateBody = assertSuccess(systemCreate, 201);
    const createdSystem = systemCreateBody.data;
    assert.equal(createdSystem.code, systemPayload.code);
    assert.equal(createdSystem.type, "OIL_PIPELINE");

    const duplicateSystemName = await requestJson("POST", `${baseUrl}/systems`, {
      ...systemPayload,
      code: makeCode("SYS_DUP_NAME"),
    });
    assertFailure(duplicateSystemName, 409, "System already exists");

    const duplicateSystemCode = await requestJson("POST", `${baseUrl}/systems`, {
      ...systemPayload,
      name: `SYS_${makeCode("NEWNAME")}`,
    });
    assertFailure(duplicateSystemCode, 409, "System already exists");

    const invalidSystemType = await requestJson("POST", `${baseUrl}/systems`, {
      ...systemPayload,
      name: `SYS_${makeCode("TYPE")}`,
      code: makeCode("SYS_TYPE"),
      type: "INVALID_TYPE",
    });
    assertFailure(invalidSystemType, 400, "Invalid system type");

    const subPayload: SubSystemPayload = {
      name: `SUB_${makeCode("NAME")}`,
      code: makeCode("SUB"),
      description: "Phase2B subsystem create",
      nomenclature: makeCode("NOM"),
      latitude: 11.123,
      longitude: -72.987,
    };

    const subCreate = await requestJson<{ id: string; code: string; name: string; nomenclature: string }>(
      "POST",
      `${baseUrl}/sub-systems`,
      subPayload
    );
    const subCreateBody = assertSuccess(subCreate, 201);
    const createdSubSystem = subCreateBody.data;

    const duplicateSubName = await requestJson("POST", `${baseUrl}/sub-systems`, {
      ...subPayload,
      code: makeCode("SUB_DUP_NAME"),
      nomenclature: makeCode("NOM_DUP_NAME"),
    });
    assertFailure(duplicateSubName, 409, "Sub-system already exists");

    const duplicateSubCode = await requestJson("POST", `${baseUrl}/sub-systems`, {
      ...subPayload,
      name: `SUB_${makeCode("NEW")}`,
      nomenclature: makeCode("NOM_DUP_CODE"),
    });
    assertFailure(duplicateSubCode, 409, "Sub-system already exists");

    const duplicateSubNomenclature = await requestJson("POST", `${baseUrl}/sub-systems`, {
      ...subPayload,
      name: `SUB_${makeCode("NOM")}`,
      code: makeCode("SUB_DUP_NOM"),
    });
    assertFailure(duplicateSubNomenclature, 409, "Sub-system already exists");

    const relationExplicitPayload: RelationPayload = {
      systemId: createdSystem.id,
      subSystemId: createdSubSystem.id,
      displayOrder: 50,
    };

    const relationExplicit = await requestJson<{ systemId: string; subSystemId: string; displayOrder: number }>(
      "POST",
      `${baseUrl}/sub-systems/relations`,
      relationExplicitPayload
    );
    const relationExplicitBody = assertSuccess(relationExplicit, 201);
    assert.equal(relationExplicitBody.data.displayOrder, 50);

    const subAutoPayload: SubSystemPayload = {
      name: `SUB_${makeCode("AUTO")}`,
      code: makeCode("SUB_AUTO"),
      description: "Phase2B subsystem create auto order",
      nomenclature: makeCode("NOM_AUTO"),
      latitude: 8.123,
      longitude: -74.111,
    };

    const subAutoCreate = await requestJson<{ id: string }>("POST", `${baseUrl}/sub-systems`, subAutoPayload);
    const createdSubAuto = assertSuccess(subAutoCreate, 201).data;

    const relationAuto = await requestJson<{ systemId: string; subSystemId: string; displayOrder: number }>(
      "POST",
      `${baseUrl}/sub-systems/relations`,
      {
        systemId: createdSystem.id,
        subSystemId: createdSubAuto.id,
      }
    );
    const relationAutoBody = assertSuccess(relationAuto, 201);
    assert.equal(relationAutoBody.data.displayOrder, 51);

    const relationSystemMissing = await requestJson(
      "POST",
      `${baseUrl}/sub-systems/relations`,
      {
        systemId: "00000000-0000-0000-0000-000000000001",
        subSystemId: createdSubSystem.id,
      }
    );
    assertFailure(relationSystemMissing, 404, "System not found");

    const relationSubMissing = await requestJson(
      "POST",
      `${baseUrl}/sub-systems/relations`,
      {
        systemId: createdSystem.id,
        subSystemId: "00000000-0000-0000-0000-000000000002",
      }
    );
    assertFailure(relationSubMissing, 404, "Sub-system not found");

    const relationDuplicate = await requestJson(
      "POST",
      `${baseUrl}/sub-systems/relations`,
      relationExplicitPayload
    );
    assertFailure(relationDuplicate, 409, "System/sub-system relation already exists");

    const baseTagPayload = {
      phdTagno: makeCode("TAGNO"),
      phdUnit: "UNIT",
      phdDataTypeName: "DOUBLE",
      phdAssetName: "asset_phase2b",
      phdDescription: "phase2b tag",
      systemId: createdSystem.id,
      subSystemId: createdSubSystem.id,
    };

    const createFlowIn = await requestJson<{ tagname: string; category: string; systemCode: string; subSystemCode: string }>(
      "POST",
      `${baseUrl}/tags`,
      {
        ...baseTagPayload,
        tagname: makeCode("TAG_FLOW_IN"),
        description: "flow in",
        category: "FLOW_IN",
      } satisfies TagPayload
    );
    const flowInBody = assertSuccess(createFlowIn, 201);
    assert.equal(flowInBody.data.category, "FLOW_IN");
    assert.equal(flowInBody.data.systemCode, createdSystem.code);
    assert.equal(flowInBody.data.subSystemCode, createdSubSystem.code);

    const createPressureOutMax = await requestJson<{ category: string }>("POST", `${baseUrl}/tags`, {
      ...baseTagPayload,
      tagname: makeCode("TAG_PRESSURE_OUT_MAX"),
      category: "PRESSURE_OUT_MAX",
      phdTagno: makeCode("TAGNO_P_MAX"),
      phdDataTypeName: "FLOAT",
    } satisfies TagPayload);
    assert.equal(assertSuccess(createPressureOutMax, 201).data.category, "PRESSURE_OUT_MAX");

    const createSelector = await requestJson<{ category: string }>("POST", `${baseUrl}/tags`, {
      ...baseTagPayload,
      tagname: makeCode("TAG_SELECTOR"),
      category: "SELECTOR_S_E",
      phdTagno: makeCode("TAGNO_SEL"),
      phdDataTypeName: "STRING",
    } satisfies TagPayload);
    assert.equal(assertSuccess(createSelector, 201).data.category, "SELECTOR_S_E");

    const createVolume = await requestJson<{ category: string }>("POST", `${baseUrl}/tags`, {
      ...baseTagPayload,
      tagname: makeCode("TAG_VOLUME"),
      category: "VOLUME",
      phdTagno: makeCode("TAGNO_VOL"),
      phdDataTypeName: "DOUBLE",
    } satisfies TagPayload);
    assert.equal(assertSuccess(createVolume, 201).data.category, "VOLUME");

    const duplicateTagname = await requestJson("POST", `${baseUrl}/tags`, {
      ...baseTagPayload,
      tagname: flowInBody.data.tagname,
      category: "FLOW_OUT",
      phdTagno: makeCode("TAGNO_DUP"),
      phdDataTypeName: "DOUBLE",
    } satisfies TagPayload);
    assertFailure(duplicateTagname, 409, "Tag already exists");

    const invalidCategory = await requestJson("POST", `${baseUrl}/tags`, {
      ...baseTagPayload,
      tagname: makeCode("TAG_BAD_CAT"),
      category: "FLOW",
      phdTagno: makeCode("TAGNO_BAD_CAT"),
      phdDataTypeName: "DOUBLE",
    } satisfies TagPayload);
    assertFailure(invalidCategory, 400, "Invalid tag category");

    const invalidDataType = await requestJson("POST", `${baseUrl}/tags`, {
      ...baseTagPayload,
      tagname: makeCode("TAG_BAD_TYPE"),
      category: "FLOW_OUT",
      phdTagno: makeCode("TAGNO_BAD_TYPE"),
      phdDataTypeName: "DECIMAL",
    } satisfies TagPayload);
    assertFailure(invalidDataType, 400, "Invalid phdDataTypeName");

    const unrelatedSubPayload: SubSystemPayload = {
      name: `SUB_${makeCode("UNRELATED")}`,
      code: makeCode("SUB_UNREL"),
      description: "unrelated subsystem",
      nomenclature: makeCode("NOM_UNREL"),
      latitude: 7.777,
      longitude: -73.333,
    };

    const unrelatedSubCreate = await requestJson<{ id: string }>("POST", `${baseUrl}/sub-systems`, unrelatedSubPayload);
    const unrelatedSubId = assertSuccess(unrelatedSubCreate, 201).data.id;

    const missingRelationTag = await requestJson("POST", `${baseUrl}/tags`, {
      ...baseTagPayload,
      tagname: makeCode("TAG_NO_REL"),
      category: "FLOW_OUT",
      phdTagno: makeCode("TAGNO_NO_REL"),
      subSystemId: unrelatedSubId,
      phdDataTypeName: "DOUBLE",
    } satisfies TagPayload);
    assertFailure(missingRelationTag, 404, "System/sub-system relation not found");

    const sharedPhdTagNo = makeCode("TAGNO_SHARED");
    const samePhdTagNoA = await requestJson<{ id: string }>("POST", `${baseUrl}/tags`, {
      ...baseTagPayload,
      tagname: makeCode("TAG_SAME_NO_A"),
      category: "FLOW_OUT",
      phdTagno: sharedPhdTagNo,
      phdDataTypeName: "DOUBLE",
    } satisfies TagPayload);
    assertSuccess(samePhdTagNoA, 201);

    const samePhdTagNoB = await requestJson<{ id: string }>("POST", `${baseUrl}/tags`, {
      ...baseTagPayload,
      tagname: makeCode("TAG_SAME_NO_B"),
      category: "PRESSURE_IN",
      phdTagno: sharedPhdTagNo,
      phdDataTypeName: "DOUBLE",
    } satisfies TagPayload);
    assertSuccess(samePhdTagNoB, 201);

    const verifyWrites = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM phd.system_entity WHERE code = ${createdSystem.code}) AS phd_system_count,
        (SELECT COUNT(*)::int FROM phd.subsystem WHERE code = ${createdSubSystem.code}) AS phd_subsystem_count,
        (SELECT COUNT(*)::int FROM phd.system_subsystem WHERE system_id = ${createdSystem.id} AND subsystem_id = ${createdSubSystem.id}) AS phd_relation_count,
        (SELECT COUNT(*)::int FROM phd.tag WHERE tagname = ${flowInBody.data.tagname}) AS phd_tag_count,
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

    const verifyRow = verifyWrites.rows[0] as {
      phd_system_count: number;
      phd_subsystem_count: number;
      phd_relation_count: number;
      phd_tag_count: number;
      legacy_columns_on_phd_tag: number;
      orphan_tags: number;
    };

    assert.equal(Number(verifyRow.phd_system_count), 1);
    assert.equal(Number(verifyRow.phd_subsystem_count), 1);
    assert.ok(Number(verifyRow.phd_relation_count) >= 1);
    assert.equal(Number(verifyRow.phd_tag_count), 1);
    assert.equal(Number(verifyRow.legacy_columns_on_phd_tag), 0);
    assert.equal(Number(verifyRow.orphan_tags), 0);

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

    const flowReadBack = await requestJson<Array<{ tagname: string; category: string }>>(
      "GET",
      `${baseUrl}/tags/flow?systemCode=${encodeURIComponent(createdSystem.code)}`
    );
    const flowReadBackBody = assertSuccess(flowReadBack, 200);
    const flowReadBackList = flowReadBackBody.data;
    assert.ok(flowReadBackList.some((item) => item.tagname === flowInBody.data.tagname && item.category === "FLOW_IN"));

    console.log("phase2b-http-errors", JSON.stringify({
      systemInvalidType: invalidSystemType.status,
      relationSystemMissing: relationSystemMissing.status,
      relationDuplicate: relationDuplicate.status,
      tagInvalidCategory: invalidCategory.status,
      tagInvalidDataType: invalidDataType.status,
      tagDuplicate: duplicateTagname.status,
    }));

    console.log("phase2b-write.integration: OK");
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
  console.error("phase2b-write.integration: FAILED", error);
  process.exit(1);
});
