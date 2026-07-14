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

function buildCatalogWorkbookWithExtendedRange(
  rows: Array<Record<string, unknown>>,
  lastRow: number,
  options?: { sheetName?: string; headers?: string[] }
): Buffer {
  const headers = options?.headers ?? HEADERS;
  const sheetName = options?.sheetName ?? "catalog";

  const wb = XLSX.read(buildCatalogWorkbook(rows, options), { type: "buffer" });
  const ws = wb.Sheets[sheetName];
  if (ws) {
    const endCol = XLSX.utils.encode_col(headers.length - 1);
    ws["!ref"] = `A1:${endCol}${lastRow}`;
  }

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

    const noPhdDataTypeRows = [
      {
        systemName: makeCode("No_DataType_System"),
        systemCode: makeCode("SYS_NO_DT"),
        systemType: "OIL_PIPELINE",
        subSystemName: makeCode("No_DataType_Sub"),
        subSystemCode: makeCode("SUB_NO_DT"),
        nomenclature: makeCode("NOM_NO_DT"),
        tagname: makeCode("TAG_NO_DT"),
        category: "FLOW_OUT",
      },
    ];

    const noPhdDataTypeBuffer = buildCatalogWorkbook(noPhdDataTypeRows, {
      headers: HEADERS.filter((header) => header !== "phdDataTypeName"),
    });
    const noPhdDataTypeResult = await postImport(baseUrl, noPhdDataTypeBuffer, "catalog.xlsx");
    assert.equal(noPhdDataTypeResult.status, 200);

    const noPhdDataTypeBody = noPhdDataTypeResult.body as ImportResponse;
    assert.equal(noPhdDataTypeBody.errors.length, 0);
    assert.equal(noPhdDataTypeBody.tags.created, 1);

    const noPhdDataTypeTag = await db
      .select({
        phdTagNo: phdTag.phdTagNo,
        phdDataType: phdTag.phdDataType,
        phdUnit: phdTag.phdUnit,
        phdAssetName: phdTag.phdAssetName,
        phdDescription: phdTag.phdDescription,
      })
      .from(phdTag)
      .where(eq(phdTag.tagname, String(noPhdDataTypeRows[0].tagname)))
      .limit(1);
    assert.equal(noPhdDataTypeTag.length, 1);
    assert.equal(noPhdDataTypeTag[0]?.phdTagNo, null);
    assert.equal(noPhdDataTypeTag[0]?.phdDataType, null);
    assert.equal(noPhdDataTypeTag[0]?.phdUnit, null);
    assert.equal(noPhdDataTypeTag[0]?.phdAssetName, null);
    assert.equal(noPhdDataTypeTag[0]?.phdDescription, null);

    const noPhdColumnsRows = [
      {
        systemName: makeCode("No_PHD_Columns_System"),
        systemCode: makeCode("SYS_NO_PHD"),
        systemType: "PRODUCT_PIPELINE",
        subSystemName: makeCode("No_PHD_Columns_Sub"),
        subSystemCode: makeCode("SUB_NO_PHD"),
        nomenclature: makeCode("NOM_NO_PHD"),
        tagname: makeCode("TAG_NO_PHD"),
        category: "PRESSURE_IN",
      },
    ];

    const noPhdColumnsBuffer = buildCatalogWorkbook(noPhdColumnsRows, {
      headers: HEADERS.filter((header) => !header.startsWith("phd")),
    });
    const noPhdColumnsResult = await postImport(baseUrl, noPhdColumnsBuffer, "catalog.xlsx");
    assert.equal(noPhdColumnsResult.status, 200);

    const noPhdColumnsBody = noPhdColumnsResult.body as ImportResponse;
    assert.equal(noPhdColumnsBody.errors.length, 0);
    assert.equal(noPhdColumnsBody.tags.created, 1);

    const noPhdColumnsTag = await db
      .select({
        phdTagNo: phdTag.phdTagNo,
        phdDataType: phdTag.phdDataType,
        phdUnit: phdTag.phdUnit,
        phdAssetName: phdTag.phdAssetName,
        phdDescription: phdTag.phdDescription,
      })
      .from(phdTag)
      .where(eq(phdTag.tagname, String(noPhdColumnsRows[0].tagname)))
      .limit(1);
    assert.equal(noPhdColumnsTag.length, 1);
    assert.equal(noPhdColumnsTag[0]?.phdTagNo, null);
    assert.equal(noPhdColumnsTag[0]?.phdDataType, null);

    const emptyPhdRows = [
      {
        systemName: makeCode("Empty_PHD_System"),
        systemCode: makeCode("SYS_EMPTY_PHD"),
        systemType: "OIL_PIPELINE",
        subSystemName: makeCode("Empty_PHD_Sub"),
        subSystemCode: makeCode("SUB_EMPTY_PHD"),
        nomenclature: makeCode("NOM_EMPTY_PHD"),
        tagname: makeCode("TAG_EMPTY_PHD"),
        category: "VOLUME",
        phdTagno: "",
        phdUnit: "",
        phdDataTypeName: "",
        phdAssetName: "",
        phdDescription: "",
      },
    ];

    const emptyPhdResult = await postImport(baseUrl, buildCatalogWorkbook(emptyPhdRows), "catalog.xlsx");
    assert.equal(emptyPhdResult.status, 200);
    const emptyPhdBody = emptyPhdResult.body as ImportResponse;
    assert.equal(emptyPhdBody.errors.length, 0);

    const emptyPhdTag = await db
      .select({
        phdTagNo: phdTag.phdTagNo,
        phdDataType: phdTag.phdDataType,
        phdUnit: phdTag.phdUnit,
        phdAssetName: phdTag.phdAssetName,
        phdDescription: phdTag.phdDescription,
      })
      .from(phdTag)
      .where(eq(phdTag.tagname, String(emptyPhdRows[0].tagname)))
      .limit(1);
    assert.equal(emptyPhdTag.length, 1);
    assert.equal(emptyPhdTag[0]?.phdTagNo, null);
    assert.equal(emptyPhdTag[0]?.phdDataType, null);
    assert.equal(emptyPhdTag[0]?.phdUnit, null);
    assert.equal(emptyPhdTag[0]?.phdAssetName, null);
    assert.equal(emptyPhdTag[0]?.phdDescription, null);

    const [metaBeforeMissingUpdate] = await db
      .select({
        phdTagNo: phdTag.phdTagNo,
        phdDataType: phdTag.phdDataType,
        phdUnit: phdTag.phdUnit,
        phdAssetName: phdTag.phdAssetName,
        phdDescription: phdTag.phdDescription,
      })
      .from(phdTag)
      .where(eq(phdTag.tagname, tagA))
      .limit(1);
    assert.ok(metaBeforeMissingUpdate);

    const updateMissingPhdColumnsRows = [
      {
        systemName: String(updatedRows[0].systemName),
        systemCode: String(updatedRows[0].systemCode),
        systemType: String(updatedRows[0].systemType),
        subSystemName: String(updatedRows[0].subSystemName),
        subSystemCode: String(updatedRows[0].subSystemCode),
        nomenclature: String(updatedRows[0].nomenclature),
        tagname: String(updatedRows[0].tagname),
        category: String(updatedRows[0].category),
        description: "Updated without phd columns",
      },
    ];

    const updateMissingPhdColumnsResult = await postImport(
      baseUrl,
      buildCatalogWorkbook(updateMissingPhdColumnsRows, {
        headers: HEADERS.filter((header) => !header.startsWith("phd")),
      }),
      "catalog.xlsx"
    );
    assert.equal(updateMissingPhdColumnsResult.status, 200);

    const [metaAfterMissingUpdate] = await db
      .select({
        description: phdTag.description,
        phdTagNo: phdTag.phdTagNo,
        phdDataType: phdTag.phdDataType,
        phdUnit: phdTag.phdUnit,
        phdAssetName: phdTag.phdAssetName,
        phdDescription: phdTag.phdDescription,
      })
      .from(phdTag)
      .where(eq(phdTag.tagname, tagA))
      .limit(1);
    assert.equal(metaAfterMissingUpdate?.description, "Updated without phd columns");
    assert.equal(metaAfterMissingUpdate?.phdTagNo, metaBeforeMissingUpdate.phdTagNo);
    assert.equal(metaAfterMissingUpdate?.phdDataType, metaBeforeMissingUpdate.phdDataType);
    assert.equal(metaAfterMissingUpdate?.phdUnit, metaBeforeMissingUpdate.phdUnit);
    assert.equal(metaAfterMissingUpdate?.phdAssetName, metaBeforeMissingUpdate.phdAssetName);
    assert.equal(metaAfterMissingUpdate?.phdDescription, metaBeforeMissingUpdate.phdDescription);

    const updateEmptyPhdCellsRows = [
      {
        ...updateMissingPhdColumnsRows[0],
        description: "Updated with empty phd cells",
        phdTagno: "",
        phdUnit: "",
        phdDataTypeName: "",
        phdAssetName: "",
        phdDescription: "",
      },
    ];

    const updateEmptyPhdCellsResult = await postImport(baseUrl, buildCatalogWorkbook(updateEmptyPhdCellsRows), "catalog.xlsx");
    assert.equal(updateEmptyPhdCellsResult.status, 200);

    const [metaAfterEmptyCellsUpdate] = await db
      .select({
        description: phdTag.description,
        phdTagNo: phdTag.phdTagNo,
        phdDataType: phdTag.phdDataType,
        phdUnit: phdTag.phdUnit,
        phdAssetName: phdTag.phdAssetName,
        phdDescription: phdTag.phdDescription,
      })
      .from(phdTag)
      .where(eq(phdTag.tagname, tagA))
      .limit(1);
    assert.equal(metaAfterEmptyCellsUpdate?.description, "Updated with empty phd cells");
    assert.equal(metaAfterEmptyCellsUpdate?.phdTagNo, metaBeforeMissingUpdate.phdTagNo);
    assert.equal(metaAfterEmptyCellsUpdate?.phdDataType, metaBeforeMissingUpdate.phdDataType);
    assert.equal(metaAfterEmptyCellsUpdate?.phdUnit, metaBeforeMissingUpdate.phdUnit);
    assert.equal(metaAfterEmptyCellsUpdate?.phdAssetName, metaBeforeMissingUpdate.phdAssetName);
    assert.equal(metaAfterEmptyCellsUpdate?.phdDescription, metaBeforeMissingUpdate.phdDescription);

    const explicitPhdUpdateRows = [
      {
        ...updateMissingPhdColumnsRows[0],
        description: "Updated with explicit phd values",
        phdTagno: makeCode("PHD_EXPLICIT"),
        phdUnit: "KPA",
        phdDataTypeName: "INTEGER",
        phdAssetName: "asset-explicit",
        phdDescription: "explicit phd metadata",
      },
    ];

    const explicitPhdUpdateResult = await postImport(baseUrl, buildCatalogWorkbook(explicitPhdUpdateRows), "catalog.xlsx");
    assert.equal(explicitPhdUpdateResult.status, 200);

    const [metaAfterExplicitUpdate] = await db
      .select({
        description: phdTag.description,
        phdTagNo: phdTag.phdTagNo,
        phdDataType: phdTag.phdDataType,
        phdUnit: phdTag.phdUnit,
        phdAssetName: phdTag.phdAssetName,
        phdDescription: phdTag.phdDescription,
      })
      .from(phdTag)
      .where(eq(phdTag.tagname, tagA))
      .limit(1);
    assert.equal(metaAfterExplicitUpdate?.description, "Updated with explicit phd values");
    assert.equal(metaAfterExplicitUpdate?.phdTagNo, explicitPhdUpdateRows[0].phdTagno);
    assert.equal(metaAfterExplicitUpdate?.phdDataType, "INTEGER");
    assert.equal(metaAfterExplicitUpdate?.phdUnit, explicitPhdUpdateRows[0].phdUnit);
    assert.equal(metaAfterExplicitUpdate?.phdAssetName, explicitPhdUpdateRows[0].phdAssetName);
    assert.equal(metaAfterExplicitUpdate?.phdDescription, explicitPhdUpdateRows[0].phdDescription);

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

    const emptyRowsIgnoredRows = [
      {
        systemName: makeCode("Empty_Ignored_A"),
        systemCode: makeCode("SYS_EMPTY_IGN_A"),
        systemType: "OIL_PIPELINE",
        subSystemName: makeCode("Empty_Ignored_Sub_A"),
        subSystemCode: makeCode("SUB_EMPTY_IGN_A"),
        nomenclature: makeCode("NOM_EMPTY_IGN_A"),
        tagname: makeCode("TAG_EMPTY_IGN_A"),
        category: "FLOW_IN",
      },
      {},
      {
        systemName: "   ",
        systemCode: "   ",
        systemType: "   ",
        subSystemName: "   ",
        subSystemCode: "   ",
        nomenclature: "   ",
        tagname: "   ",
        category: "   ",
      },
      {
        systemName: makeCode("Empty_Ignored_B"),
        systemCode: makeCode("SYS_EMPTY_IGN_B"),
        systemType: "PRODUCT_PIPELINE",
        subSystemName: makeCode("Empty_Ignored_Sub_B"),
        subSystemCode: makeCode("SUB_EMPTY_IGN_B"),
        nomenclature: makeCode("NOM_EMPTY_IGN_B"),
        tagname: makeCode("TAG_EMPTY_IGN_B"),
        category: "VOLUME",
      },
    ];

    const emptyRowsIgnoredResult = await postImport(baseUrl, buildCatalogWorkbook(emptyRowsIgnoredRows), "catalog.xlsx");
    assert.equal(emptyRowsIgnoredResult.status, 200);
    const emptyRowsIgnoredBody = emptyRowsIgnoredResult.body as ImportResponse;
    assert.equal(emptyRowsIgnoredBody.errors.length, 0);
    assert.equal(emptyRowsIgnoredBody.rowsProcessed, 2);
    assert.equal(emptyRowsIgnoredBody.tags.created, 2);

    const partialAtRow15Wb = XLSX.read(buildCatalogWorkbook([]), { type: "buffer" });
    const partialAtRow15Ws = partialAtRow15Wb.Sheets.catalog;
    if (!partialAtRow15Ws) {
      throw new Error("catalog sheet was not created for row 15 partial test");
    }
    partialAtRow15Ws.B15 = { t: "s", v: makeCode("SYS_PARTIAL") };
    const endCol = XLSX.utils.encode_col(HEADERS.length - 1);
    partialAtRow15Ws["!ref"] = `A1:${endCol}15`;
    const partialAtRow15Buffer = XLSX.write(partialAtRow15Wb, { type: "buffer", bookType: "xlsx" });

    const partialAtRow15Result = await postImport(baseUrl, partialAtRow15Buffer, "catalog.xlsx");
    assert.equal(partialAtRow15Result.status, 400);
    const partialAtRow15Body = partialAtRow15Result.body as { errors: Array<{ row: number; field: string }> };
    assert.ok(partialAtRow15Body.errors.some((err) => err.row === 15 && err.field === "subSystemCode"));
    assert.ok(partialAtRow15Body.errors.some((err) => err.row === 15 && err.field === "tagname"));

    const rangeRows17 = Array.from({ length: 17 }).map((_, i) => ({
      systemName: makeCode(`Range500_System_${i + 1}`),
      systemCode: makeCode(`SYS_R500_${i + 1}`),
      systemType: i % 2 === 0 ? "OIL_PIPELINE" : "PRODUCT_PIPELINE",
      subSystemName: makeCode(`Range500_Sub_${i + 1}`),
      subSystemCode: makeCode(`SUB_R500_${i + 1}`),
      nomenclature: makeCode(`NOM_R500_${i + 1}`),
      tagname: makeCode(`TAG_R500_${i + 1}`),
      category: i % 3 === 0 ? "FLOW_OUT" : i % 3 === 1 ? "PRESSURE_IN" : "VOLUME",
    }));

    const range500Buffer = buildCatalogWorkbookWithExtendedRange(rangeRows17, 500);
    const range500DryRun = await postImport(`${baseUrl}?dryRun=true`, range500Buffer, "catalog.xlsx");
    assert.equal(range500DryRun.status, 200);
    const range500DryRunBody = range500DryRun.body as ImportResponse;
    assert.equal(range500DryRunBody.rowsProcessed, 17);
    assert.equal(range500DryRunBody.errors.length, 0);
    assert.equal(range500DryRunBody.tags.created, 17);

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

    assert.equal(publicRow.public_system_table, null);
    assert.equal(publicRow.public_subsystem_table, null);
    assert.equal(publicRow.public_relation_table, null);
    assert.equal(publicRow.public_tag_table, null);

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
