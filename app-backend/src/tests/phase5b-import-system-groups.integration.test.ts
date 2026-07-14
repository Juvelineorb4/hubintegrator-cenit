import assert from "node:assert/strict";
import express from "express";
import XLSX from "xlsx";

import { eq, inArray, sql } from "drizzle-orm";
import { appRouter } from "../app.routes";
import { db, pool } from "../core/db/drizzle/client";
import {
  phdSubsystem,
  phdSystemEntity,
  phdSystemGroup,
  phdSystemGroupMember,
  phdSystemSubsystem,
  phdTag,
} from "../core/db/drizzle/schema/phd.schema";

type ImportCounters = { created: number; updated: number; skipped: number };

type ImportSummary = {
  dryRun: boolean;
  rowsProcessed: number;
  systems: ImportCounters;
  subsystems: ImportCounters;
  relations: ImportCounters;
  tags: ImportCounters;
  groups: ImportCounters;
  groupMembers: ImportCounters;
  errors: Array<{ sheet?: string; row: number; field: string; value: string | null; reason: string }>;
};

type ApiListResponse<T> = {
  success: boolean;
  data: T[];
  total: number;
};

type SystemGroupListRow = {
  id: string;
  name: string;
  displayOrder: number;
  memberCount: number;
};

const BASE_URL = "http://127.0.0.1";
const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CATALOG_HEADERS = [
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

const SYSTEM_GROUP_HEADERS = [
  "groupName",
  "groupDescription",
  "groupDisplayOrder",
  "systemCode",
  "systemDisplayOrder",
];

function makeCode(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function makeWorkbook(options: {
  catalogRows: Array<Record<string, unknown>>;
  systemGroupRows?: Array<Record<string, unknown>>;
  includeSystemGroupsSheet?: boolean;
  catalogHeaders?: string[];
  systemGroupHeaders?: string[];
}): Buffer {
  const wb = XLSX.utils.book_new();

  const catalogHeaders = options.catalogHeaders ?? CATALOG_HEADERS;
  const catalogAoa: unknown[][] = [catalogHeaders];
  for (const row of options.catalogRows) {
    catalogAoa.push(catalogHeaders.map((header) => row[header] ?? ""));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catalogAoa), "catalog");

  if (options.includeSystemGroupsSheet !== false) {
    const groupHeaders = options.systemGroupHeaders ?? SYSTEM_GROUP_HEADERS;
    const groupAoa: unknown[][] = [groupHeaders];
    for (const row of options.systemGroupRows ?? []) {
      groupAoa.push(groupHeaders.map((header) => row[header] ?? ""));
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(groupAoa), "system_groups");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function postImport(url: string, fileBuffer: Buffer): Promise<{ status: number; body: unknown }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(fileBuffer)], { type: EXCEL_MIME }), "catalog.xlsx");

  const response = await fetch(url, { method: "POST", body: form });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

async function getJson<T>(url: string): Promise<{ status: number; body: T }> {
  const response = await fetch(url);
  const body = (await response.json()) as T;
  return { status: response.status, body };
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const dbNameQuery = await pool.query("select current_database() as db");
  const dbName = String(dbNameQuery.rows[0]?.db ?? "");
  assert.equal(dbName, "industrial_integration_hub_test", "Tests must run against industrial_integration_hub_test");

  const app = express();
  app.use(express.json());
  app.use("/api", appRouter);

  const server = await new Promise<import("http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind phase5b test server");
  }

  const importUrl = `${BASE_URL}:${address.port}/api/phd/import`;

  const systemA = makeCode("SYS5B_A");
  const systemB = makeCode("SYS5B_B");
  const systemC = makeCode("SYS5B_C");
  const subA = makeCode("SUB5B_A");
  const subB = makeCode("SUB5B_B");
  const subC = makeCode("SUB5B_C");
  const tagA = makeCode("TAG5B_A");
  const tagB = makeCode("TAG5B_B");
  const tagC = makeCode("TAG5B_C");

  const groupAlpha = makeCode("GROUP5B_ALPHA");
  const groupBeta = makeCode("GROUP5B_BETA");
  const rollbackSystem = makeCode("SYS5B_ROLLBACK");
  const rollbackSub = makeCode("SUB5B_ROLLBACK");
  const rollbackTag = makeCode("TAG5B_ROLLBACK");

  const trackedSystemCodes = [systemA, systemB, systemC, rollbackSystem];
  const trackedSubCodes = [subA, subB, subC, rollbackSub];
  const trackedTagNames = [tagA, tagB, tagC, rollbackTag];
  const trackedGroupNames = [groupAlpha, groupBeta];

  try {
    const countsBefore = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM phd.system_entity) AS systems,
        (SELECT COUNT(*)::int FROM phd.subsystem) AS subsystems,
        (SELECT COUNT(*)::int FROM phd.system_subsystem) AS relations,
        (SELECT COUNT(*)::int FROM phd.tag) AS tags,
        (SELECT COUNT(*)::int FROM phd.system_group) AS groups,
        (SELECT COUNT(*)::int FROM phd.system_group_member) AS members
    `);

    const catalogRows = [
      {
        systemName: `${systemA}_NAME`,
        systemCode: systemA,
        systemType: "OIL_PIPELINE",
        subSystemName: `${subA}_NAME`,
        subSystemCode: subA,
        nomenclature: `${subA}_NOM`,
        tagname: tagA,
        category: "FLOW_IN",
        phdDataTypeName: "DOUBLE",
        displayOrder: 1,
      },
      {
        systemName: `${systemB}_NAME`,
        systemCode: systemB,
        systemType: "PRODUCT_PIPELINE",
        subSystemName: `${subB}_NAME`,
        subSystemCode: subB,
        nomenclature: `${subB}_NOM`,
        tagname: tagB,
        category: "PRESSURE_OUT",
        phdDataTypeName: "FLOAT",
        displayOrder: 2,
      },
      {
        systemName: `${systemC}_NAME`,
        systemCode: systemC,
        systemType: "OIL_PIPELINE",
        subSystemName: `${subC}_NAME`,
        subSystemCode: subC,
        nomenclature: `${subC}_NOM`,
        tagname: tagC,
        category: "SELECTOR_S_E",
        phdDataTypeName: "BOOLEAN",
        displayOrder: 3,
      },
    ];

    const validSystemGroupRows = [
      { groupName: groupAlpha, groupDescription: "Main corridor", groupDisplayOrder: 1, systemCode: systemA, systemDisplayOrder: 1 },
      { groupName: groupAlpha, groupDescription: "Main corridor", groupDisplayOrder: 1, systemCode: systemB, systemDisplayOrder: 2 },
      { groupName: groupBeta, groupDescription: "Secondary corridor", groupDisplayOrder: 2, systemCode: systemB, systemDisplayOrder: 1 },
      { groupName: groupBeta, groupDescription: "Secondary corridor", groupDisplayOrder: 2, systemCode: systemC, systemDisplayOrder: 2 },
    ];

    const withoutSystemGroupsSheet = await postImport(
      `${importUrl}?dryRun=true`,
      makeWorkbook({ catalogRows, includeSystemGroupsSheet: false })
    );
    assert.equal(withoutSystemGroupsSheet.status, 200);
    const withoutSheetBody = withoutSystemGroupsSheet.body as ImportSummary;
    assert.equal(withoutSheetBody.groups.created, 0);
    assert.equal(withoutSheetBody.groupMembers.created, 0);

    const dryRunValid = await postImport(
      `${importUrl}?dryRun=true`,
      makeWorkbook({ catalogRows, systemGroupRows: validSystemGroupRows })
    );
    assert.equal(dryRunValid.status, 200);
    const dryRunBody = dryRunValid.body as ImportSummary;
    assert.equal(dryRunBody.dryRun, true);
    assert.equal(dryRunBody.systems.created, 3);
    assert.equal(dryRunBody.groups.created, 2);
    assert.equal(dryRunBody.groupMembers.created, 4);

    const dryRunSystemPersistCheck = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdSystemEntity)
      .where(inArray(phdSystemEntity.code, [systemA, systemB, systemC]));
    assert.equal(Number(dryRunSystemPersistCheck[0]?.c ?? 0), 0);

    const realImport = await postImport(importUrl, makeWorkbook({ catalogRows, systemGroupRows: validSystemGroupRows }));
    assert.equal(realImport.status, 200);
    const realBody = realImport.body as ImportSummary;
    assert.equal(realBody.dryRun, false);
    assert.equal(realBody.systems.created, 3);
    assert.equal(realBody.subsystems.created, 3);
    assert.equal(realBody.relations.created, 3);
    assert.equal(realBody.tags.created, 3);
    assert.equal(realBody.groups.created, 2);
    assert.equal(realBody.groupMembers.created, 4);

    const idempotent = await postImport(importUrl, makeWorkbook({ catalogRows, systemGroupRows: validSystemGroupRows }));
    assert.equal(idempotent.status, 200);
    const idempotentBody = idempotent.body as ImportSummary;
    assert.equal(idempotentBody.groups.skipped, 2);
    assert.equal(idempotentBody.groupMembers.skipped, 4);

    const updatedSystemGroupRows = [
      { groupName: groupAlpha, groupDescription: "Main corridor updated", groupDisplayOrder: 5, systemCode: systemA, systemDisplayOrder: 2 },
      { groupName: groupAlpha, groupDescription: "Main corridor updated", groupDisplayOrder: 5, systemCode: systemB, systemDisplayOrder: 1 },
      { groupName: groupBeta, groupDescription: "Secondary corridor", groupDisplayOrder: 7, systemCode: systemB, systemDisplayOrder: 1 },
      { groupName: groupBeta, groupDescription: "Secondary corridor", groupDisplayOrder: 7, systemCode: systemC, systemDisplayOrder: 2 },
    ];

    const updateImport = await postImport(importUrl, makeWorkbook({ catalogRows, systemGroupRows: updatedSystemGroupRows }));
    assert.equal(updateImport.status, 200);
    const updateBody = updateImport.body as ImportSummary;
    assert.ok(updateBody.groups.updated >= 2);
    assert.ok(updateBody.groupMembers.updated >= 2);

    const listGroups = await getJson<ApiListResponse<SystemGroupListRow>>(`${BASE_URL}:${address.port}/api/system-groups`);
    assert.equal(listGroups.status, 200);
    assert.equal(listGroups.body.success, true);

    const dbGroupsCount = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdSystemGroup)
      .where(inArray(phdSystemGroup.name, trackedGroupNames));
    assert.equal(Number(dbGroupsCount[0]?.c ?? 0), 2);

    const httpTrackedGroups = (listGroups.body.data ?? []).filter((row) => trackedGroupNames.includes(row.name));
    assert.equal(httpTrackedGroups.length, 2);

    const missingHeaderResult = await postImport(
      importUrl,
      makeWorkbook({
        catalogRows,
        systemGroupRows: validSystemGroupRows,
        systemGroupHeaders: ["groupName", "groupDisplayOrder", "systemCode"],
      })
    );
    assert.equal(missingHeaderResult.status, 400);
    const missingHeaderBody = missingHeaderResult.body as { errors: Array<{ field: string; row: number; sheet?: string }> };
    assert.ok(missingHeaderBody.errors.some((error) => error.sheet === "system_groups" && error.row === 1 && error.field === "systemDisplayOrder"));

    const groupNameEmptyResult = await postImport(
      importUrl,
      makeWorkbook({
        catalogRows,
        systemGroupRows: [{ groupName: "", groupDisplayOrder: 1, systemCode: systemA, systemDisplayOrder: 1 }],
      })
    );
    assert.equal(groupNameEmptyResult.status, 400);

    const invalidGroupOrderResult = await postImport(
      importUrl,
      makeWorkbook({
        catalogRows,
        systemGroupRows: [{ groupName: groupAlpha, groupDisplayOrder: "0", systemCode: systemA, systemDisplayOrder: 1 }],
      })
    );
    assert.equal(invalidGroupOrderResult.status, 400);

    const missingSystemResult = await postImport(
      importUrl,
      makeWorkbook({
        catalogRows,
        systemGroupRows: [{ groupName: groupAlpha, groupDisplayOrder: 1, systemCode: "999", systemDisplayOrder: 1 }],
      })
    );
    assert.equal(missingSystemResult.status, 400);
    const missingSystemBody = missingSystemResult.body as { errors: Array<{ sheet?: string; field: string; reason: string }> };
    assert.ok(missingSystemBody.errors.some((error) => error.sheet === "system_groups" && error.field === "systemCode" && error.reason === "System not found"));

    const duplicateSystemInGroupResult = await postImport(
      importUrl,
      makeWorkbook({
        catalogRows,
        systemGroupRows: [
          { groupName: groupAlpha, groupDisplayOrder: 1, systemCode: systemA, systemDisplayOrder: 1 },
          { groupName: groupAlpha, groupDisplayOrder: 1, systemCode: systemA, systemDisplayOrder: 2 },
        ],
      })
    );
    assert.equal(duplicateSystemInGroupResult.status, 400);

    const duplicateDisplayInGroupResult = await postImport(
      importUrl,
      makeWorkbook({
        catalogRows,
        systemGroupRows: [
          { groupName: groupAlpha, groupDisplayOrder: 1, systemCode: systemA, systemDisplayOrder: 1 },
          { groupName: groupAlpha, groupDisplayOrder: 1, systemCode: systemB, systemDisplayOrder: 1 },
        ],
      })
    );
    assert.equal(duplicateDisplayInGroupResult.status, 400);

    const contradictoryGroupResult = await postImport(
      importUrl,
      makeWorkbook({
        catalogRows,
        systemGroupRows: [
          { groupName: groupAlpha, groupDescription: "v1", groupDisplayOrder: 1, systemCode: systemA, systemDisplayOrder: 1 },
          { groupName: groupAlpha, groupDescription: "v2", groupDisplayOrder: 2, systemCode: systemB, systemDisplayOrder: 2 },
        ],
      })
    );
    assert.equal(contradictoryGroupResult.status, 400);

    const partialRowResult = await postImport(
      importUrl,
      makeWorkbook({
        catalogRows,
        systemGroupRows: [{ groupName: groupAlpha }],
      })
    );
    assert.equal(partialRowResult.status, 400);
    const partialRowBody = partialRowResult.body as { errors: Array<{ reason: string; field: string; sheet?: string }> };
    assert.ok(partialRowBody.errors.some((error) => error.sheet === "system_groups" && error.field === "row" && error.reason === "Partially filled row"));

    const emptyAndSpacesRowsResult = await postImport(
      importUrl,
      makeWorkbook({
        catalogRows,
        systemGroupRows: [
          { groupName: "", groupDescription: "", groupDisplayOrder: "", systemCode: "", systemDisplayOrder: "" },
          { groupName: "   ", groupDescription: "   ", groupDisplayOrder: "   ", systemCode: "   ", systemDisplayOrder: "   " },
          { groupName: groupAlpha, groupDescription: "Main corridor updated", groupDisplayOrder: 5, systemCode: systemA, systemDisplayOrder: 2 },
          { groupName: groupAlpha, groupDescription: "Main corridor updated", groupDisplayOrder: 5, systemCode: systemB, systemDisplayOrder: 1 },
          { groupName: groupBeta, groupDescription: "Secondary corridor", groupDisplayOrder: 7, systemCode: systemB, systemDisplayOrder: 1 },
          { groupName: groupBeta, groupDescription: "Secondary corridor", groupDisplayOrder: 7, systemCode: systemC, systemDisplayOrder: 2 },
        ],
      })
    );
    assert.equal(emptyAndSpacesRowsResult.status, 200);
    const emptySpacesBody = emptyAndSpacesRowsResult.body as ImportSummary;
    assert.equal(emptySpacesBody.groups.skipped, 2);
    assert.equal(emptySpacesBody.groupMembers.skipped, 4);

    const unknownHeaderPolicyResult = await postImport(
      `${importUrl}?dryRun=true`,
      makeWorkbook({
        catalogRows,
        systemGroupRows: validSystemGroupRows.map((row) => ({ ...row, ignoredColumn: "x" })),
        systemGroupHeaders: [...SYSTEM_GROUP_HEADERS, "ignoredColumn"],
      })
    );
    assert.equal(unknownHeaderPolicyResult.status, 200);

    const rollbackWorkbook = makeWorkbook({
      catalogRows: [
        {
          systemName: `${rollbackSystem}_NAME`,
          systemCode: rollbackSystem,
          systemType: "OIL_PIPELINE",
          subSystemName: `${rollbackSub}_NAME`,
          subSystemCode: rollbackSub,
          nomenclature: `${rollbackSub}_NOM`,
          tagname: rollbackTag,
          category: "FLOW_OUT",
          phdDataTypeName: "DOUBLE",
          displayOrder: 1,
        },
      ],
      systemGroupRows: [
        { groupName: groupAlpha, groupDescription: "Main corridor updated", groupDisplayOrder: 5, systemCode: systemA, systemDisplayOrder: 2 },
        { groupName: groupAlpha, groupDescription: "Main corridor updated", groupDisplayOrder: 5, systemCode: rollbackSystem, systemDisplayOrder: 2 },
      ],
    });

    const rollbackResult = await postImport(importUrl, rollbackWorkbook);
    assert.equal(rollbackResult.status, 400);

    const rollbackSystemCheck = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdSystemEntity)
      .where(eq(phdSystemEntity.code, rollbackSystem));
    assert.equal(Number(rollbackSystemCheck[0]?.c ?? 0), 0);

    const rollbackTagCheck = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdTag)
      .where(eq(phdTag.tagname, rollbackTag));
    assert.equal(Number(rollbackTagCheck[0]?.c ?? 0), 0);

    const orphanMembers = await db.execute(sql`
      SELECT COUNT(*)::int AS c
      FROM phd.system_group_member m
      LEFT JOIN phd.system_entity s ON s.id = m.system_id
      LEFT JOIN phd.system_group g ON g.id = m.system_group_id
      WHERE s.id IS NULL OR g.id IS NULL
    `);
    assert.equal(Number((orphanMembers.rows[0] as { c: number }).c), 0);

    const publicSchemaCheck = await db.execute(sql`
      SELECT
        to_regclass('public.system_group') IS NULL AS public_group_absent,
        to_regclass('public.system_group_member') IS NULL AS public_group_member_absent
    `);
    const publicChecks = publicSchemaCheck.rows[0] as { public_group_absent: boolean; public_group_member_absent: boolean };
    assert.equal(publicChecks.public_group_absent, true);
    assert.equal(publicChecks.public_group_member_absent, true);

    const countsAfter = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM phd.system_entity) AS systems,
        (SELECT COUNT(*)::int FROM phd.subsystem) AS subsystems,
        (SELECT COUNT(*)::int FROM phd.system_subsystem) AS relations,
        (SELECT COUNT(*)::int FROM phd.tag) AS tags,
        (SELECT COUNT(*)::int FROM phd.system_group) AS groups,
        (SELECT COUNT(*)::int FROM phd.system_group_member) AS members
    `);

    const before = countsBefore.rows[0] as Record<string, number>;
    const after = countsAfter.rows[0] as Record<string, number>;
    assert.equal(after.systems - before.systems >= 3, true);
    assert.equal(after.groups - before.groups >= 2, true);
    assert.equal(after.members - before.members >= 4, true);

    console.log(
      "phase5b-import.integration: OK",
      JSON.stringify({
        db: dbName,
        dryRunNoSheet: { groups: withoutSheetBody.groups, groupMembers: withoutSheetBody.groupMembers },
        dryRunWithSheet: { groups: dryRunBody.groups, groupMembers: dryRunBody.groupMembers },
        importReal: { groups: realBody.groups, groupMembers: realBody.groupMembers },
        idempotent: { groups: idempotentBody.groups, groupMembers: idempotentBody.groupMembers },
        rollbackStatus: rollbackResult.status,
        publicChecks,
      })
    );
  } finally {
    await db.delete(phdTag).where(inArray(phdTag.tagname, trackedTagNames));

    const trackedSubIds = (
      await db.select({ id: phdSubsystem.id }).from(phdSubsystem).where(inArray(phdSubsystem.code, trackedSubCodes))
    ).map((row) => row.id);
    if (trackedSubIds.length > 0) {
      await db.delete(phdSystemSubsystem).where(inArray(phdSystemSubsystem.subsystemId, trackedSubIds));
    }

    const trackedGroupIds = (
      await db.select({ id: phdSystemGroup.id }).from(phdSystemGroup).where(inArray(phdSystemGroup.name, trackedGroupNames))
    ).map((row) => row.id);
    if (trackedGroupIds.length > 0) {
      await db.delete(phdSystemGroupMember).where(inArray(phdSystemGroupMember.systemGroupId, trackedGroupIds));
    }

    await db.delete(phdSystemGroup).where(inArray(phdSystemGroup.name, trackedGroupNames));
    await db.delete(phdSubsystem).where(inArray(phdSubsystem.code, trackedSubCodes));
    await db.delete(phdSystemEntity).where(inArray(phdSystemEntity.code, trackedSystemCodes));

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
}

run().catch((error) => {
  console.error("phase5b-import.integration: FAILED", error);
  process.exit(1);
});
