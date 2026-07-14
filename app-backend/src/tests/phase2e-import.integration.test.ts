import assert from "node:assert/strict";
import express from "express";
import XLSX from "xlsx";

import { appRouter } from "../app.routes";
import { db, pool } from "../core/db/drizzle/client";
import { and, eq, inArray, sql } from "drizzle-orm";
import { phdSubsystem, phdSystemEntity, phdSystemSubsystem, phdTag } from "../core/db/drizzle/schema/phd.schema";

type ImportResponse = {
  dryRun: boolean;
  rowsProcessed: number;
  systems: { created: number; updated: number; skipped: number };
  subsystems: { created: number; updated: number; skipped: number };
  relations: { created: number; updated: number; skipped: number };
  tags: { created: number; updated: number; skipped: number };
  errors: Array<{ row: number; field: string; value: string | null; reason: string }>;
};

const BASE_URL = "http://127.0.0.1";
const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const HEADERS = [
  "systemName",
  "systemCode",
  "systemType",
  "subSystemName",
  "subSystemCode",
  "nomenclature",
  "tagname",
  "category",
  "phdDataTypeName",
  "systemDescription",
  "distance",
  "subSystemDescription",
  "latitude",
  "longitude",
  "displayOrder",
  "description",
  "phdTagno",
  "phdUnit",
  "phdAssetName",
  "phdDescription",
];

function makeCode(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function buildCatalogWorkbook(rows: Array<Record<string, unknown>>, options?: { sheetName?: string; headers?: string[] }): Buffer {
  const headers = options?.headers ?? HEADERS;
  const sheetName = options?.sheetName ?? "catalog";

  const aoa: unknown[][] = [headers];
  for (const row of rows) {
    aoa.push(headers.map((header) => row[header] ?? ""));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function postImport(
  url: string,
  fileBuffer: Buffer,
  filename: string,
  includeFile: boolean = true
): Promise<{ status: number; body: unknown }> {
  const form = new FormData();
  if (includeFile) {
    form.append("file", new Blob([new Uint8Array(fileBuffer)], { type: EXCEL_MIME }), filename);
  }

  const response = await fetch(url, {
    method: "POST",
    body: form,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  return { status: response.status, body };
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
    throw new Error("Failed to bind phase2e test server");
  }

  const baseUrl = `${BASE_URL}:${address.port}/api/phd/import`;

  try {
    const systemCodeA = makeCode("SYS_E_A");
    const systemCodeB = makeCode("SYS_E_B");
    const subCodeA = makeCode("SUB_E_A");
    const subCodeB = makeCode("SUB_E_B");
    const subCodeC = makeCode("SUB_E_C");

    const systemNameA = makeCode("System_E_A");
    const systemNameB = makeCode("System_E_B");
    const subNameA = makeCode("Subsystem_E_A");
    const subNameB = makeCode("Subsystem_E_B");
    const subNameC = makeCode("Subsystem_E_C");

    const tagA = makeCode("TAG_E_A");
    const tagB = makeCode("TAG_E_B");
    const tagC = makeCode("TAG_E_C");

    const validRows: Array<Record<string, unknown>> = [
      {
        systemName: systemNameA,
        systemCode: systemCodeA,
        systemType: "OIL_PIPELINE",
        subSystemName: subNameA,
        subSystemCode: subCodeA,
        nomenclature: makeCode("NOM_E_A"),
        tagname: tagA,
        category: "FLOW_IN",
        phdDataTypeName: "DOUBLE",
        systemDescription: "Desc SA",
        distance: "10.5",
        subSystemDescription: "Desc SSA",
        latitude: "7.1",
        longitude: "-73.1",
        displayOrder: 1,
        description: "Tag A description",
        phdTagno: makeCode("PHDNO_A"),
        phdUnit: "BPH",
        phdAssetName: "assetA",
        phdDescription: "phd desc A",
      },
      {
        systemName: systemNameA,
        systemCode: systemCodeA,
        systemType: "OIL_PIPELINE",
        subSystemName: subNameB,
        subSystemCode: subCodeB,
        nomenclature: makeCode("NOM_E_B"),
        tagname: tagB,
        category: "PRESSURE_OUT",
        phdDataTypeName: "FLOAT",
        displayOrder: 2,
        description: "Tag B description",
        phdTagno: makeCode("PHDNO_B"),
      },
      {
        systemName: systemNameB,
        systemCode: systemCodeB,
        systemType: "PRODUCT_PIPELINE",
        subSystemName: subNameC,
        subSystemCode: subCodeC,
        nomenclature: makeCode("NOM_E_C"),
        tagname: tagC,
        category: "VOLUME",
        phdDataTypeName: "DOUBLE",
        displayOrder: 1,
        description: "Tag C description",
        phdTagno: makeCode("PHDNO_C"),
      },
    ];

    const validBuffer = buildCatalogWorkbook(validRows);
    const importResult = await postImport(baseUrl, validBuffer, "catalog.xlsx");
    assert.equal(importResult.status, 200);

    const importBody = importResult.body as ImportResponse;
    assert.equal(importBody.dryRun, false);
    assert.equal(importBody.rowsProcessed, 3);
    assert.equal(importBody.systems.created, 2);
    assert.equal(importBody.subsystems.created, 3);
    assert.equal(importBody.relations.created, 3);
    assert.equal(importBody.tags.created, 3);

    const secondImport = await postImport(baseUrl, validBuffer, "catalog.xlsx");
    assert.equal(secondImport.status, 200);

    const secondBody = secondImport.body as ImportResponse;
    assert.equal(secondBody.systems.skipped, 2);
    assert.equal(secondBody.subsystems.skipped, 3);
    assert.equal(secondBody.relations.skipped, 3);
    assert.equal(secondBody.tags.skipped, 3);

    const updatedRows = [...validRows];
    updatedRows[0] = {
      ...updatedRows[0],
      systemName: `${systemNameA}_UPDATED`,
      description: "Tag A description updated",
      phdAssetName: "assetA-updated",
      category: "PRESSURE_IN_MAX",
      subSystemCode: subCodeB,
      subSystemName: `${subNameB}_UPDATED`,
      nomenclature: validRows[1].nomenclature,
      displayOrder: 9,
    };

    updatedRows[1] = {
      ...updatedRows[1],
      systemName: `${systemNameA}_UPDATED`,
      subSystemName: `${subNameB}_UPDATED`,
      subSystemDescription: "Updated subsystem description",
      displayOrder: 9,
    };

    const updateBuffer = buildCatalogWorkbook(updatedRows);
    const updateImport = await postImport(baseUrl, updateBuffer, "catalog.xlsx");
    assert.equal(updateImport.status, 200);

    const updateBody = updateImport.body as ImportResponse;
    assert.ok(updateBody.systems.updated >= 1);
    assert.ok(updateBody.subsystems.updated >= 1);
    assert.ok(updateBody.relations.updated >= 1);
    assert.ok(updateBody.tags.updated >= 1);

    const drySystem = makeCode("SYS_E_DRY");
    const drySub = makeCode("SUB_E_DRY");
    const dryTag = makeCode("TAG_E_DRY");

    const dryRunRows = [
      {
        systemName: "Dry System",
        systemCode: drySystem,
        systemType: "OIL_PIPELINE",
        subSystemName: "Dry Sub",
        subSystemCode: drySub,
        nomenclature: makeCode("NOM_DRY"),
        tagname: dryTag,
        category: "FLOW_OUT",
        phdDataTypeName: "DOUBLE",
      },
    ];

    const dryRunResult = await postImport(`${baseUrl}?dryRun=true`, buildCatalogWorkbook(dryRunRows), "catalog.xlsx");
    assert.equal(dryRunResult.status, 200);
    const dryRunBody = dryRunResult.body as ImportResponse;
    assert.equal(dryRunBody.dryRun, true);
    assert.equal(dryRunBody.systems.created, 1);
    assert.equal(dryRunBody.tags.created, 1);

    const dryPersistCheck = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdSystemEntity)
      .where(eq(phdSystemEntity.code, drySystem));
    assert.equal(Number(dryPersistCheck[0]?.c), 0);

    const noFileResult = await postImport(baseUrl, Buffer.from(""), "catalog.xlsx", false);
    assert.equal(noFileResult.status, 400);

    const badExtResult = await postImport(baseUrl, validBuffer, "catalog.txt");
    assert.equal(badExtResult.status, 400);

    const emptyFileResult = await postImport(baseUrl, Buffer.alloc(0), "empty.xlsx");
    assert.equal(emptyFileResult.status, 400);

    const overLimitResult = await postImport(baseUrl, Buffer.alloc(10 * 1024 * 1024 + 1), "big.xlsx");
    assert.equal(overLimitResult.status, 400);

    const missingSheet = await postImport(baseUrl, buildCatalogWorkbook(validRows, { sheetName: "wrong" }), "catalog.xlsx");
    assert.equal(missingSheet.status, 400);

    const missingColumn = await postImport(
      baseUrl,
      buildCatalogWorkbook(validRows, { headers: HEADERS.filter((header) => header !== "category") }),
      "catalog.xlsx"
    );
    assert.equal(missingColumn.status, 400);

    const invalidCategory = await postImport(
      baseUrl,
      buildCatalogWorkbook([{ ...validRows[0], systemCode: makeCode("SYS_BAD_CAT"), subSystemCode: makeCode("SUB_BAD_CAT"), tagname: makeCode("TAG_BAD_CAT"), category: "FLOW_TEST" }]),
      "catalog.xlsx"
    );
    assert.equal(invalidCategory.status, 400);

    const invalidDataType = await postImport(
      baseUrl,
      buildCatalogWorkbook([{ ...validRows[0], systemCode: makeCode("SYS_BAD_DT"), subSystemCode: makeCode("SUB_BAD_DT"), tagname: makeCode("TAG_BAD_DT"), phdDataTypeName: "DECIMAL" }]),
      "catalog.xlsx"
    );
    assert.equal(invalidDataType.status, 400);

    const invalidSystemType = await postImport(
      baseUrl,
      buildCatalogWorkbook([{ ...validRows[0], systemCode: makeCode("SYS_BAD_TYPE"), subSystemCode: makeCode("SUB_BAD_TYPE"), tagname: makeCode("TAG_BAD_TYPE"), systemType: "OLEODUCTO" }]),
      "catalog.xlsx"
    );
    assert.equal(invalidSystemType.status, 400);

    const duplicateTag = await postImport(
      baseUrl,
      buildCatalogWorkbook([
        { ...validRows[0], systemCode: makeCode("SYS_DUP_TAG"), subSystemCode: makeCode("SUB_DUP_TAG_A"), tagname: "DUP_TAG" },
        { ...validRows[0], systemCode: makeCode("SYS_DUP_TAG"), subSystemCode: makeCode("SUB_DUP_TAG_B"), tagname: "DUP_TAG" },
      ]),
      "catalog.xlsx"
    );
    assert.equal(duplicateTag.status, 400);

    const contradictorySystem = await postImport(
      baseUrl,
      buildCatalogWorkbook([
        { ...validRows[0], systemCode: "SYS_CONTRADICT", tagname: makeCode("TAG_CON_A"), subSystemCode: makeCode("SUB_CON_A") },
        { ...validRows[0], systemCode: "SYS_CONTRADICT", systemName: "Different Name", tagname: makeCode("TAG_CON_B"), subSystemCode: makeCode("SUB_CON_B") },
      ]),
      "catalog.xlsx"
    );
    assert.equal(contradictorySystem.status, 400);

    const contradictorySubSystem = await postImport(
      baseUrl,
      buildCatalogWorkbook([
        { ...validRows[0], subSystemCode: "SUB_CONTRADICT", tagname: makeCode("TAG_SUB_A") },
        { ...validRows[0], subSystemCode: "SUB_CONTRADICT", subSystemName: "Different Sub", tagname: makeCode("TAG_SUB_B") },
      ]),
      "catalog.xlsx"
    );
    assert.equal(contradictorySubSystem.status, 400);

    const contradictoryNomenclature = await postImport(
      baseUrl,
      buildCatalogWorkbook([
        { ...validRows[0], subSystemCode: "SUB_NOM_CON", nomenclature: "NOM_A", tagname: makeCode("TAG_NOM_A") },
        { ...validRows[0], subSystemCode: "SUB_NOM_CON", nomenclature: "NOM_B", tagname: makeCode("TAG_NOM_B") },
      ]),
      "catalog.xlsx"
    );
    assert.equal(contradictoryNomenclature.status, 400);

    const invalidDistance = await postImport(
      baseUrl,
      buildCatalogWorkbook([{ ...validRows[0], systemCode: makeCode("SYS_BAD_DIST"), subSystemCode: makeCode("SUB_BAD_DIST"), tagname: makeCode("TAG_BAD_DIST"), distance: "not-num" }]),
      "catalog.xlsx"
    );
    assert.equal(invalidDistance.status, 400);

    const invalidCoordinates = await postImport(
      baseUrl,
      buildCatalogWorkbook([{ ...validRows[0], systemCode: makeCode("SYS_BAD_COORD"), subSystemCode: makeCode("SUB_BAD_COORD"), tagname: makeCode("TAG_BAD_COORD"), latitude: "abc" }]),
      "catalog.xlsx"
    );
    assert.equal(invalidCoordinates.status, 400);

    const invalidDisplayOrder = await postImport(
      baseUrl,
      buildCatalogWorkbook([{ ...validRows[0], systemCode: makeCode("SYS_BAD_ORD"), subSystemCode: makeCode("SUB_BAD_ORD"), tagname: makeCode("TAG_BAD_ORD"), displayOrder: -1 }]),
      "catalog.xlsx"
    );
    assert.equal(invalidDisplayOrder.status, 400);

    const emptyRowWorkbook = buildCatalogWorkbook([
      validRows[0],
      {},
      { ...validRows[1], tagname: makeCode("TAG_EMPTY_ROW") },
    ]);
    const emptyRowResult = await postImport(baseUrl, emptyRowWorkbook, "catalog.xlsx");
    assert.equal(emptyRowResult.status, 400);

    const rollbackSysA = makeCode("SYS_ROLL_A");
    const rollbackSysB = makeCode("SYS_ROLL_B");
    const sharedNomenclature = makeCode("NOM_SHARED");

    const rollbackRows = [
      {
        ...validRows[0],
        systemCode: rollbackSysA,
        systemName: "Rollback A",
        subSystemCode: makeCode("SUB_ROLL_A"),
        nomenclature: sharedNomenclature,
        tagname: makeCode("TAG_ROLL_A"),
      },
      {
        ...validRows[0],
        systemCode: rollbackSysB,
        systemName: "Rollback B",
        subSystemCode: makeCode("SUB_ROLL_B"),
        nomenclature: sharedNomenclature,
        tagname: makeCode("TAG_ROLL_B"),
      },
    ];

    const rollbackResult = await postImport(baseUrl, buildCatalogWorkbook(rollbackRows), "catalog.xlsx");
    assert.equal(rollbackResult.status, 500);

    const rollbackCheck = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdSystemEntity)
      .where(inArray(phdSystemEntity.code, [rollbackSysA, rollbackSysB]));
    assert.equal(Number(rollbackCheck[0]?.c), 0);

    const evidence = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM phd.system_entity WHERE code IN (${systemCodeA}, ${systemCodeB})) AS phd_system_count,
        (SELECT COUNT(*)::int FROM phd.subsystem WHERE code IN (${subCodeA}, ${subCodeB}, ${subCodeC})) AS phd_subsystem_count,
        (SELECT COUNT(*)::int FROM phd.tag WHERE tagname IN (${tagA}, ${tagB}, ${tagC})) AS phd_tag_count,
        (SELECT COUNT(*)::int
           FROM information_schema.columns
          WHERE table_schema = 'phd'
            AND table_name = 'tag'
            AND column_name = 'category') AS physical_category_column,
        (SELECT COUNT(*)::int FROM phd.tag WHERE system_subsystem_id IS NULL) AS null_tag_relation,
        (SELECT COUNT(*)::int
           FROM phd.tag t
      LEFT JOIN phd.system_subsystem ss ON ss.id = t.system_subsystem_id
          WHERE ss.id IS NULL) AS orphan_tags,
        (SELECT COUNT(*)::int
           FROM phd.system_subsystem ss
      LEFT JOIN phd.system_entity se ON se.id = ss.system_id
      LEFT JOIN phd.subsystem sub ON sub.id = ss.subsystem_id
          WHERE se.id IS NULL OR sub.id IS NULL) AS orphan_relations
    `);

    const evidenceRow = evidence.rows[0] as {
      phd_system_count: number;
      phd_subsystem_count: number;
      phd_tag_count: number;
      physical_category_column: number;
      null_tag_relation: number;
      orphan_tags: number;
      orphan_relations: number;
    };

    assert.equal(Number(evidenceRow.phd_system_count), 2);
    assert.equal(Number(evidenceRow.phd_subsystem_count), 3);
    assert.equal(Number(evidenceRow.phd_tag_count), 3);
    assert.equal(Number(evidenceRow.physical_category_column), 0);
    assert.equal(Number(evidenceRow.null_tag_relation), 0);
    assert.equal(Number(evidenceRow.orphan_tags), 0);
    assert.equal(Number(evidenceRow.orphan_relations), 0);

    const publicCheck = await pool.query(`
      SELECT
        to_regclass('public.system_entity') AS public_system_table,
        to_regclass('public.sub_system') AS public_subsystem_table,
        to_regclass('public.system_sub_system') AS public_relation_table,
        to_regclass('public.tag') AS public_tag_table
    `);

    const publicRow = publicCheck.rows[0] as {
      public_system_table: string | null;
      public_subsystem_table: string | null;
      public_relation_table: string | null;
      public_tag_table: string | null;
    };

    if (publicRow.public_system_table) {
      const check = await pool.query("SELECT COUNT(*)::int AS c FROM public.system_entity WHERE code IN ($1, $2)", [systemCodeA, systemCodeB]);
      assert.equal(Number(check.rows[0].c), 0);
    }

    if (publicRow.public_subsystem_table) {
      const check = await pool.query("SELECT COUNT(*)::int AS c FROM public.sub_system WHERE code IN ($1, $2, $3)", [subCodeA, subCodeB, subCodeC]);
      assert.equal(Number(check.rows[0].c), 0);
    }

    if (publicRow.public_relation_table) {
      const relRows = await db
        .select({ id: phdSystemSubsystem.id })
        .from(phdSystemSubsystem)
        .where(
          and(
            inArray(phdSystemSubsystem.systemId, (await db.select({ id: phdSystemEntity.id }).from(phdSystemEntity).where(inArray(phdSystemEntity.code, [systemCodeA, systemCodeB]))).map((x) => x.id)),
            inArray(phdSystemSubsystem.subsystemId, (await db.select({ id: phdSubsystem.id }).from(phdSubsystem).where(inArray(phdSubsystem.code, [subCodeA, subCodeB, subCodeC]))).map((x) => x.id))
          )
        );
      if (relRows.length) {
        const check = await pool.query("SELECT COUNT(*)::int AS c FROM public.system_sub_system WHERE id = ANY($1)", [relRows.map((r) => r.id)]);
        assert.equal(Number(check.rows[0].c), 0);
      }
    }

    if (publicRow.public_tag_table) {
      const check = await pool.query("SELECT COUNT(*)::int AS c FROM public.tag WHERE tagname IN ($1, $2, $3)", [tagA, tagB, tagC]);
      assert.equal(Number(check.rows[0].c), 0);
    }

    console.log("phase2e-http-results", JSON.stringify({
      importValid: importResult.status,
      importIdempotent: secondImport.status,
      importUpdated: updateImport.status,
      dryRun: dryRunResult.status,
      validationErrors: 400,
      rollbackError: rollbackResult.status,
      fileMissing: noFileResult.status,
      invalidExt: badExtResult.status,
      emptyFile: emptyFileResult.status,
      overLimit: overLimitResult.status,
    }));

    console.log("phase2e-import.integration: OK");
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
  console.error("phase2e-import.integration: FAILED", error);
  process.exit(1);
});
