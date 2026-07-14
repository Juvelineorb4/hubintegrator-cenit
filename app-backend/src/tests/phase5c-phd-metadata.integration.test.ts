import assert from "node:assert/strict";
import express from "express";
import multer from "multer";
import XLSX from "xlsx";

import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../core/db/drizzle/client";
import {
  phdSubsystem,
  phdSystemEntity,
  phdSystemGroup,
  phdSystemGroupMember,
  phdSystemSubsystem,
  phdTag,
} from "../core/db/drizzle/schema/phd.schema";
import { PhdMetadataClient } from "../modules/phd-import/phd-metadata.client";
import { resolvePhdMetadataConfig } from "../modules/phd-import/phd-metadata.config";
import { PhdImportController } from "../modules/phd-import/phd-import.controller";
import { PhdImportParser } from "../modules/phd-import/phd-import.parser";
import { PhdImportRepository } from "../modules/phd-import/phd-import.repository";
import { PhdImportService } from "../modules/phd-import/phd-import.service";
import { PhdImportValidator } from "../modules/phd-import/phd-import.validator";

type ImportResponse = {
  dryRun: boolean;
  rowsProcessed: number;
  systems: { created: number; updated: number; skipped: number };
  subsystems: { created: number; updated: number; skipped: number };
  relations: { created: number; updated: number; skipped: number };
  tags: { created: number; updated: number; skipped: number };
  groups: { created: number; updated: number; skipped: number };
  groupMembers: { created: number; updated: number; skipped: number };
  phdMetadata: {
    mode: "disabled" | "optional" | "required";
    tagsRequested: number;
    tagsFound: number;
    tagsNotFound: number;
    complete: number;
    partial: number;
    failed: number;
    fieldsNull: {
      phdTagno: number;
      phdUnit: number;
      phdDataTypeName: number;
      phdAssetName: number;
      phdDescription: number;
    };
    warnings: string[];
  };
  errors: Array<{ row: number; field: string; value: string | null; reason: string }>;
};

type MockBehavior =
  | { kind: "ok"; status?: number; payload: unknown }
  | { kind: "invalid-json" }
  | { kind: "timeout" };

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

class MockOdbcApi {
  private readonly routes = new Map<string, MockBehavior>();
  private readonly delaysMs = new Map<string, number>();
  calls: string[] = [];
  active = 0;
  maxActive = 0;

  set(tagname: string, behavior: MockBehavior, delayMs: number = 0): void {
    this.routes.set(tagname.toLowerCase(), behavior);
    this.delaysMs.set(tagname.toLowerCase(), delayMs);
  }

  reset(): void {
    this.routes.clear();
    this.delaysMs.clear();
    this.calls = [];
    this.active = 0;
    this.maxActive = 0;
  }

  async handle(url: string, init?: RequestInit): Promise<Response | null> {
    if (!url.startsWith("http://mock-odbc")) {
      return null;
    }

    const parsed = new URL(url);
    const match = /^\/tags\/(.+)\/browse$/.exec(parsed.pathname);
    if (!match) {
      return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
    }

    const tagname = decodeURIComponent(match[1]);
    const key = tagname.toLowerCase();
    this.calls.push(tagname);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);

    const behavior = this.routes.get(key) ?? { kind: "ok", payload: [] };
    const delayMs = this.delaysMs.get(key) ?? 0;

    if (delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), delayMs);
        if (init?.signal) {
          init.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true }
          );
        }
      });
    }

    try {
      if (behavior.kind === "timeout") {
        await new Promise<never>((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            );
          }
        });
      }

      if (behavior.kind === "invalid-json") {
        return new Response("{broken", { status: 200, headers: { "content-type": "application/json" } });
      }

      if (behavior.kind !== "ok") {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      const status = behavior.status ?? 200;
      return new Response(JSON.stringify(behavior.payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    } finally {
      this.active -= 1;
    }
  }
}

function makeCode(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function buildCatalogWorkbook(rows: Array<Record<string, unknown>>): Buffer {
  const aoa: unknown[][] = [HEADERS];
  for (const row of rows) {
    aoa.push(HEADERS.map((header) => row[header] ?? ""));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "catalog");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function buildBaseRow(overrides: Record<string, unknown>): Record<string, unknown> {
  const suffix = makeCode("BASE");
  return {
    systemName: `System_${suffix}`,
    systemCode: `SYS_${suffix}`,
    systemType: "OIL_PIPELINE",
    subSystemName: `Sub_${suffix}`,
    subSystemCode: `SUB_${suffix}`,
    nomenclature: `NOM_${suffix}`,
    tagname: `TAG_${suffix}`,
    category: "FLOW_IN",
    displayOrder: 1,
    ...overrides,
  };
}

function makeImportServer(envOverrides: Record<string, string | undefined>) {
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ODBC_CONNECT_TIMEOUT_SECONDS: "1",
    ODBC_READ_TIMEOUT_SECONDS: "1",
    PHD_METADATA_CONCURRENCY: "5",
    PHD_METADATA_MAX_TAGS: "1000",
    ...envOverrides,
  };

  const metadataConfig = resolvePhdMetadataConfig(mergedEnv);
  const metadataClient =
    metadataConfig.mode === "disabled"
      ? null
      : new PhdMetadataClient({
          baseUrl: metadataConfig.odbcApiUrl,
          connectTimeoutSeconds: metadataConfig.connectTimeoutSeconds,
          readTimeoutSeconds: metadataConfig.readTimeoutSeconds,
        });

  const parser = new PhdImportParser();
  const validator = new PhdImportValidator();
  const repository = new PhdImportRepository();
  const service = new PhdImportService(parser, validator, repository, metadataConfig, metadataClient);
  const controller = new PhdImportController(service);

  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  router.post(
    "/phd/import",
    (req, res, next) => {
      upload.single("file")(req, res, (error) => {
        if (error) {
          controller.uploadError(error, req, res, next);
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({ message: "Missing required file field", errors: [] });
          return;
        }

        if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
          res.status(400).json({ message: "Only .xlsx files are supported", errors: [] });
          return;
        }

        if (!file.buffer?.length) {
          res.status(400).json({ message: "File is empty", errors: [] });
          return;
        }

        next();
      });
    },
    controller.importCatalog
  );

  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
}

async function postImport(
  baseUrl: string,
  fileBuffer: Buffer,
  dryRun: boolean = false
): Promise<{ status: number; body: unknown }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(fileBuffer)], { type: EXCEL_MIME }), "catalog.xlsx");

  const response = await fetch(`${baseUrl}/api/phd/import?dryRun=${dryRun ? "true" : "false"}`, {
    method: "POST",
    body: form,
  });

  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

async function startServer(app: express.Express): Promise<{ server: import("http").Server; baseUrl: string }> {
  const server = await new Promise<import("http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind phase5c test server");
  }

  return { server, baseUrl: `${BASE_URL}:${address.port}` };
}

async function stopServer(server: import("http").Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function deleteByLists(params: {
  tagNames: string[];
  subCodes: string[];
  systemCodes: string[];
  groupNames: string[];
}): Promise<void> {
  const { tagNames, subCodes, systemCodes, groupNames } = params;

  if (tagNames.length > 0) {
    await db.delete(phdTag).where(inArray(phdTag.tagname, tagNames));
  }

  if (subCodes.length > 0) {
    const subIds = (
      await db.select({ id: phdSubsystem.id }).from(phdSubsystem).where(inArray(phdSubsystem.code, subCodes))
    ).map((row) => row.id);

    if (subIds.length > 0) {
      await db.delete(phdSystemSubsystem).where(inArray(phdSystemSubsystem.subsystemId, subIds));
    }
  }

  if (groupNames.length > 0) {
    const groupIds = (
      await db.select({ id: phdSystemGroup.id }).from(phdSystemGroup).where(inArray(phdSystemGroup.name, groupNames))
    ).map((row) => row.id);

    if (groupIds.length > 0) {
      await db.delete(phdSystemGroupMember).where(inArray(phdSystemGroupMember.systemGroupId, groupIds));
    }

    await db.delete(phdSystemGroup).where(inArray(phdSystemGroup.name, groupNames));
  }

  if (subCodes.length > 0) {
    await db.delete(phdSubsystem).where(inArray(phdSubsystem.code, subCodes));
  }

  if (systemCodes.length > 0) {
    await db.delete(phdSystemEntity).where(inArray(phdSystemEntity.code, systemCodes));
  }
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const dbNameQuery = await pool.query("select current_database() as db");
  const dbName = String(dbNameQuery.rows[0]?.db ?? "");
  assert.equal(dbName, "industrial_integration_hub_test", "Tests must run against industrial_integration_hub_test");

  const originalFetch = globalThis.fetch;
  const mockOdbc = new MockOdbcApi();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const mocked = await mockOdbc.handle(url, init);
    if (mocked) {
      return mocked;
    }

    return originalFetch(input as never, init);
  }) as typeof globalThis.fetch;

  const tracked = {
    tags: [] as string[],
    systems: [] as string[],
    subs: [] as string[],
    groups: [] as string[],
  };

  try {
    assert.throws(() =>
      resolvePhdMetadataConfig({
        ...process.env,
        PHD_METADATA_MODE: "bad",
      })
    );

    assert.throws(() =>
      resolvePhdMetadataConfig({
        ...process.env,
        PHD_METADATA_MODE: "optional",
        ODBC_API_URL: "http://mock-odbc",
        PHD_METADATA_CONCURRENCY: "0",
      })
    );

    assert.throws(() =>
      resolvePhdMetadataConfig({
        ...process.env,
        PHD_METADATA_MODE: "optional",
        ODBC_API_URL: "http://mock-odbc",
        PHD_METADATA_MAX_TAGS: "0",
      })
    );

    mockOdbc.reset();
    {
      const app = makeImportServer({ PHD_METADATA_MODE: "disabled", ODBC_API_URL: "http://mock-odbc" });
      const { server, baseUrl } = await startServer(app);
      try {
        const row = buildBaseRow({
          systemCode: makeCode("P5C1_SYS_DISABLED"),
          subSystemCode: makeCode("P5C1_SUB_DISABLED"),
          tagname: makeCode("P5C1_TAG_DISABLED"),
          phdTagno: "EXCEL_TAGNO",
          phdUnit: "EXCEL_UNIT",
          phdDataTypeName: "DOUBLE",
        });

        tracked.systems.push(String(row.systemCode));
        tracked.subs.push(String(row.subSystemCode));
        tracked.tags.push(String(row.tagname));

        const result = await postImport(baseUrl, buildCatalogWorkbook([row]), true);
        assert.equal(result.status, 200);

        const body = result.body as ImportResponse;
        assert.equal(body.phdMetadata.mode, "disabled");
        assert.equal(body.phdMetadata.tagsRequested, 0);
        assert.equal(mockOdbc.calls.length, 0);
      } finally {
        await stopServer(server);
      }
    }

    mockOdbc.reset();
    {
      const app = makeImportServer({
        PHD_METADATA_MODE: "optional",
        ODBC_API_URL: "http://mock-odbc",
        PHD_METADATA_MAX_TAGS: "1",
      });
      const { server, baseUrl } = await startServer(app);
      try {
        const rowA = buildBaseRow({
          systemCode: makeCode("P5C1_SYS_MAX_A"),
          subSystemCode: makeCode("P5C1_SUB_MAX_A"),
          tagname: makeCode("P5C1_TAG_MAX_A"),
        });
        const rowB = buildBaseRow({
          systemCode: makeCode("P5C1_SYS_MAX_B"),
          subSystemCode: makeCode("P5C1_SUB_MAX_B"),
          tagname: makeCode("P5C1_TAG_MAX_B"),
        });

        const result = await postImport(baseUrl, buildCatalogWorkbook([rowA, rowB]), true);
        assert.equal(result.status, 400);
        assert.equal(mockOdbc.calls.length, 0);
      } finally {
        await stopServer(server);
      }
    }

    mockOdbc.reset();
    {
      const app = makeImportServer({
        PHD_METADATA_MODE: "optional",
        ODBC_API_URL: "http://mock-odbc",
        PHD_METADATA_CONCURRENCY: "2",
      });
      const { server, baseUrl } = await startServer(app);
      try {
        const tag1 = makeCode("P5C1_TAG_OPT_1");
        const tag2 = makeCode("P5C1_TAG_OPT_2");
        const tag3 = makeCode("P5C1_TAG_OPT_3");
        const tag4 = makeCode("P5C1_TAG_OPT_4");
        const tag5 = makeCode("P5C1_TAG_OPT_5");

        const tags = [tag1, tag2, tag3, tag4, tag5];
        for (const tag of tags) {
          mockOdbc.set(tag, {
            kind: "ok",
            payload: [
              {
                TAGNAME: tag,
                TAGNO: `${tag}_NO`,
                UNIT: "BPD",
                DATA_TYPE_NAME: "double",
                ASSET_NAME: `${tag}_ASSET`,
                DESCRIPTION: `${tag}_DESC`,
              },
            ],
          }, 60);
        }

        tracked.tags.push(...tags);

        const rows = tags.map((tag, index) => {
          const row = buildBaseRow({
            systemCode: makeCode(`P5C1_SYS_OPT_${index}`),
            subSystemCode: makeCode(`P5C1_SUB_OPT_${index}`),
            tagname: tag,
            phdTagno: "EXCEL_NO",
            phdUnit: "EXCEL_UNIT",
            phdDataTypeName: "STRING",
          });
          tracked.systems.push(String(row.systemCode));
          tracked.subs.push(String(row.subSystemCode));
          return row;
        });

        const result = await postImport(baseUrl, buildCatalogWorkbook(rows), true);
        assert.equal(result.status, 200);

        const body = result.body as ImportResponse;
        assert.equal(body.phdMetadata.tagsRequested, 5);
        assert.equal(body.phdMetadata.tagsFound, 5);
        assert.equal(body.phdMetadata.complete, 5);
        assert.equal(mockOdbc.maxActive <= 2, true);
        assert.ok(body.phdMetadata.warnings.some((w) => w.includes("overrides Excel value")));
      } finally {
        await stopServer(server);
      }
    }

    mockOdbc.reset();
    {
      const app = makeImportServer({
        PHD_METADATA_MODE: "optional",
        ODBC_API_URL: "http://mock-odbc",
      });
      const { server, baseUrl } = await startServer(app);
      try {
        const tagCaseA = makeCode("P5C1_TAG_CASE");
        const tagCaseB = tagCaseA.toLowerCase();
        mockOdbc.set(tagCaseA, {
          kind: "ok",
          payload: { tagname: tagCaseA, tagno: "AAA", units: "KPA", dataTypeName: "float" },
        });

        const rowA = buildBaseRow({
          systemCode: makeCode("P5C1_SYS_CASE_A"),
          subSystemCode: makeCode("P5C1_SUB_CASE_A"),
          tagname: tagCaseA,
        });
        const rowB = buildBaseRow({
          systemCode: makeCode("P5C1_SYS_CASE_B"),
          subSystemCode: makeCode("P5C1_SUB_CASE_B"),
          tagname: tagCaseB,
        });

        tracked.systems.push(String(rowA.systemCode), String(rowB.systemCode));
        tracked.subs.push(String(rowA.subSystemCode), String(rowB.subSystemCode));
        tracked.tags.push(tagCaseA, tagCaseB);

        const result = await postImport(baseUrl, buildCatalogWorkbook([rowA, rowB]), true);
        assert.equal(result.status, 200);

        const body = result.body as ImportResponse;
        assert.equal(body.phdMetadata.tagsRequested, 1);
        assert.equal(mockOdbc.calls.length, 1);
      } finally {
        await stopServer(server);
      }
    }

    mockOdbc.reset();
    {
      const app = makeImportServer({
        PHD_METADATA_MODE: "optional",
        ODBC_API_URL: "http://mock-odbc",
      });
      const { server, baseUrl } = await startServer(app);
      try {
        const tagNotFound = makeCode("P5C1_TAG_NF");
        const tagHttp500 = makeCode("P5C1_TAG_HTTP500");
        const tagTimeout = makeCode("P5C1_TAG_TIMEOUT");
        const tagInvalidJson = makeCode("P5C1_TAG_JSON");
        const tagUnknownType = makeCode("P5C1_TAG_DTYPE");
        const tagMismatch = makeCode("P5C1_TAG_MISMATCH");
        const tagDuplicateEquivalent = makeCode("P5C1_TAG_DUP_EQ");
        const tagDuplicateContradictory = makeCode("P5C1_TAG_DUP_BAD");
        const tagPartial = makeCode("P5C1_TAG_PARTIAL");

        mockOdbc.set(tagNotFound, { kind: "ok", payload: [] });
        mockOdbc.set(tagHttp500, { kind: "ok", status: 500, payload: { message: "error" } });
        mockOdbc.set(tagTimeout, { kind: "timeout" });
        mockOdbc.set(tagInvalidJson, { kind: "invalid-json" });
        mockOdbc.set(tagUnknownType, { kind: "ok", payload: { TAGNAME: tagUnknownType, DATA_TYPE_NAME: "DECIMAL" } });
        mockOdbc.set(tagMismatch, { kind: "ok", payload: { TAGNAME: `${tagMismatch}_OTHER`, TAGNO: "1" } });
        mockOdbc.set(tagDuplicateEquivalent, {
          kind: "ok",
          payload: [
            { TAGNAME: tagDuplicateEquivalent, TAGNO: "200", UNIT: "PSI" },
            { TAGNAME: tagDuplicateEquivalent, TAGNO: "200", UNIT: "PSI" },
          ],
        });
        mockOdbc.set(tagDuplicateContradictory, {
          kind: "ok",
          payload: [
            { TAGNAME: tagDuplicateContradictory, TAGNO: "300", UNIT: "PSI" },
            { TAGNAME: tagDuplicateContradictory, TAGNO: "301", UNIT: "PSI" },
          ],
        });
        mockOdbc.set(tagPartial, {
          kind: "ok",
          payload: [{ TAGNAME: tagPartial, TAGNO: "500" }],
        });

        const tags = [
          tagNotFound,
          tagHttp500,
          tagTimeout,
          tagInvalidJson,
          tagUnknownType,
          tagMismatch,
          tagDuplicateEquivalent,
          tagDuplicateContradictory,
          tagPartial,
        ];

        const rows = tags.map((tag, index) => {
          const row = buildBaseRow({
            systemCode: makeCode(`P5C1_SYS_WARN_${index}`),
            subSystemCode: makeCode(`P5C1_SUB_WARN_${index}`),
            tagname: tag,
          });
          tracked.systems.push(String(row.systemCode));
          tracked.subs.push(String(row.subSystemCode));
          tracked.tags.push(String(row.tagname));
          return row;
        });

        const result = await postImport(baseUrl, buildCatalogWorkbook(rows), true);
        assert.equal(result.status, 200);

        const body = result.body as ImportResponse;
        assert.equal(body.phdMetadata.mode, "optional");
        assert.equal(body.phdMetadata.tagsRequested, tags.length);
        assert.equal(body.phdMetadata.tagsFound >= 2, true);
        assert.equal(body.phdMetadata.tagsNotFound >= 2, true);
        assert.equal(body.phdMetadata.failed >= 4, true);
        assert.equal(body.phdMetadata.partial >= 1, true);
        assert.equal(body.phdMetadata.warnings.length >= 6, true);
      } finally {
        await stopServer(server);
      }
    }

    mockOdbc.reset();
    {
      const app = makeImportServer({
        PHD_METADATA_MODE: "required",
        ODBC_API_URL: "http://mock-odbc",
      });
      const { server, baseUrl } = await startServer(app);
      try {
        const tagReqOk = makeCode("P5C1_TAG_REQ_OK");
        const tagReqPartial = makeCode("P5C1_TAG_REQ_PARTIAL");
        mockOdbc.set(tagReqOk, {
          kind: "ok",
          payload: {
            TAGNAME: tagReqOk,
            TAGNO: "REQ_1",
            UNITS: "BAR",
            DATA_TYPE_NAME: "DOUBLE",
            ASSET_NAME: "asset-req",
            DESCRIPTION: "desc-req",
          },
        });
        mockOdbc.set(tagReqPartial, {
          kind: "ok",
          payload: [{ TAGNAME: tagReqPartial, TAGNO: "REQ_2" }],
        });

        const rowOk = buildBaseRow({
          systemCode: makeCode("P5C1_SYS_REQ_OK"),
          subSystemCode: makeCode("P5C1_SUB_REQ_OK"),
          tagname: tagReqOk,
        });
        const rowPartial = buildBaseRow({
          systemCode: makeCode("P5C1_SYS_REQ_PART"),
          subSystemCode: makeCode("P5C1_SUB_REQ_PART"),
          tagname: tagReqPartial,
        });

        tracked.systems.push(String(rowOk.systemCode), String(rowPartial.systemCode));
        tracked.subs.push(String(rowOk.subSystemCode), String(rowPartial.subSystemCode));
        tracked.tags.push(String(rowOk.tagname), String(rowPartial.tagname));

        const okResult = await postImport(baseUrl, buildCatalogWorkbook([rowOk, rowPartial]), false);
        assert.equal(okResult.status, 200);

        const okBody = okResult.body as ImportResponse;
        assert.equal(okBody.phdMetadata.tagsFound, 2);
        assert.equal(okBody.phdMetadata.partial, 1);

        const check = await db
          .select({
            tagname: phdTag.tagname,
            phdTagNo: phdTag.phdTagNo,
            phdUnit: phdTag.phdUnit,
            phdDataType: phdTag.phdDataType,
          })
          .from(phdTag)
          .where(inArray(phdTag.tagname, [tagReqOk, tagReqPartial]));
        assert.equal(check.length, 2);
        const foundOk = check.find((row) => row.tagname === tagReqOk);
        const foundPartial = check.find((row) => row.tagname === tagReqPartial);
        assert.equal(foundOk?.phdTagNo, "REQ_1");
        assert.equal(foundOk?.phdDataType, "DOUBLE");
        assert.equal(foundPartial?.phdTagNo, "REQ_2");
        assert.equal(foundPartial?.phdUnit, null);

        const beforeFailCounts = await db.execute(sql`
          SELECT
            (SELECT COUNT(*)::int FROM phd.system_entity WHERE code = ${makeCode("NON_EXIST")}) AS c
        `);
        assert.ok(beforeFailCounts.rows.length >= 1);

        const requiredFailScenarios: Array<{ tag: string; behavior: MockBehavior }> = [
          { tag: makeCode("P5C1_TAG_REQ_NOTFOUND"), behavior: { kind: "ok", payload: [] } },
          { tag: makeCode("P5C1_TAG_REQ_HTTP500"), behavior: { kind: "ok", status: 500, payload: { message: "x" } } },
          { tag: makeCode("P5C1_TAG_REQ_TIMEOUT"), behavior: { kind: "timeout" } },
          { tag: makeCode("P5C1_TAG_REQ_BADJSON"), behavior: { kind: "invalid-json" } },
          { tag: makeCode("P5C1_TAG_REQ_DTYPE"), behavior: { kind: "ok", payload: { TAGNAME: "P5C1_TAG_REQ_DTYPE", DATA_TYPE_NAME: "DECIMAL" } } },
          { tag: makeCode("P5C1_TAG_REQ_MISMATCH"), behavior: { kind: "ok", payload: { TAGNAME: "OTHER_TAG" } } },
          {
            tag: makeCode("P5C1_TAG_REQ_CONTRADICT"),
            behavior: {
              kind: "ok",
              payload: [
                { TAGNAME: "P5C1_TAG_REQ_CONTRADICT", TAGNO: "X" },
                { TAGNAME: "P5C1_TAG_REQ_CONTRADICT", TAGNO: "Y" },
              ],
            },
          },
        ];

        for (const scenario of requiredFailScenarios) {
          mockOdbc.reset();
          mockOdbc.set(scenario.tag, scenario.behavior);

          const row = buildBaseRow({
            systemCode: makeCode("P5C1_SYS_REQ_FAIL"),
            subSystemCode: makeCode("P5C1_SUB_REQ_FAIL"),
            tagname: scenario.tag,
          });

          const result = await postImport(baseUrl, buildCatalogWorkbook([row]), false);
          assert.equal(result.status, 400);

          const body = result.body as { errors?: Array<{ value: string | null; reason: string }> };
          assert.equal(Array.isArray(body.errors), true);
          assert.equal((body.errors ?? []).length > 0, true);
          assert.equal((body.errors ?? [])[0]?.value, scenario.tag);

          const persisted = await db
            .select({ c: sql<number>`count(*)::int` })
            .from(phdTag)
            .where(eq(phdTag.tagname, scenario.tag));
          assert.equal(Number(persisted[0]?.c ?? 0), 0);
        }
      } finally {
        await stopServer(server);
      }
    }

    mockOdbc.reset();
    {
      const app = makeImportServer({
        PHD_METADATA_MODE: "optional",
        ODBC_API_URL: "http://mock-odbc",
      });
      const { server, baseUrl } = await startServer(app);
      try {
        const persistenceTag = makeCode("P5C1_TAG_PERSIST");
        const sysCode = makeCode("P5C1_SYS_PERSIST");
        const subCode = makeCode("P5C1_SUB_PERSIST");
        tracked.tags.push(persistenceTag);
        tracked.systems.push(sysCode);
        tracked.subs.push(subCode);

        mockOdbc.set(persistenceTag, {
          kind: "ok",
          payload: {
            TAGNAME: persistenceTag,
            TAGNO: "PHD_1",
            UNITS: "PSI",
            DATA_TYPE_NAME: "FLOAT",
            ASSET_NAME: "asset-phd-1",
            DESCRIPTION: "desc-phd-1",
          },
        });

        const createRow = buildBaseRow({
          systemCode: sysCode,
          subSystemCode: subCode,
          tagname: persistenceTag,
          phdTagno: "EXCEL_1",
          phdUnit: "EXCEL_UNIT",
          phdDataTypeName: "STRING",
          phdAssetName: "excel-asset",
          phdDescription: "excel-desc",
        });

        const createResult = await postImport(baseUrl, buildCatalogWorkbook([createRow]), false);
        assert.equal(createResult.status, 200);

        const [created] = await db
          .select({
            phdTagNo: phdTag.phdTagNo,
            phdUnit: phdTag.phdUnit,
            phdDataType: phdTag.phdDataType,
            phdAssetName: phdTag.phdAssetName,
            phdDescription: phdTag.phdDescription,
          })
          .from(phdTag)
          .where(eq(phdTag.tagname, persistenceTag));

        assert.equal(created?.phdTagNo, "PHD_1");
        assert.equal(created?.phdUnit, "PSI");
        assert.equal(created?.phdDataType, "FLOAT");
        assert.equal(created?.phdAssetName, "asset-phd-1");
        assert.equal(created?.phdDescription, "desc-phd-1");

        mockOdbc.set(persistenceTag, {
          kind: "ok",
          payload: {
            TAGNAME: persistenceTag,
            TAGNO: "",
            UNITS: "",
            DATA_TYPE_NAME: "",
            ASSET_NAME: "",
            DESCRIPTION: "",
          },
        });

        const updateRow = buildBaseRow({
          systemCode: sysCode,
          subSystemCode: subCode,
          tagname: persistenceTag,
          description: "metadata-only-update",
        });

        const updateResult = await postImport(baseUrl, buildCatalogWorkbook([updateRow]), false);
        assert.equal(updateResult.status, 200);
        const updateBody = updateResult.body as ImportResponse;
        assert.equal(updateBody.tags.updated >= 1, true);

        const [updated] = await db
          .select({
            description: phdTag.description,
            phdTagNo: phdTag.phdTagNo,
            phdUnit: phdTag.phdUnit,
            phdDataType: phdTag.phdDataType,
            phdAssetName: phdTag.phdAssetName,
            phdDescription: phdTag.phdDescription,
          })
          .from(phdTag)
          .where(eq(phdTag.tagname, persistenceTag));

        assert.equal(updated?.description, "metadata-only-update");
        assert.equal(updated?.phdTagNo, "PHD_1");
        assert.equal(updated?.phdUnit, "PSI");
        assert.equal(updated?.phdDataType, "FLOAT");
        assert.equal(updated?.phdAssetName, "asset-phd-1");
        assert.equal(updated?.phdDescription, "desc-phd-1");

        const createNullTag = makeCode("P5C1_TAG_CREATE_NULL");
        const createNullSys = makeCode("P5C1_SYS_CREATE_NULL");
        const createNullSub = makeCode("P5C1_SUB_CREATE_NULL");
        tracked.tags.push(createNullTag);
        tracked.systems.push(createNullSys);
        tracked.subs.push(createNullSub);

        mockOdbc.set(createNullTag, {
          kind: "ok",
          payload: { TAGNAME: createNullTag, TAGNO: null, UNITS: null, DATA_TYPE_NAME: null, ASSET_NAME: null, DESCRIPTION: null },
        });

        const createNullRow = buildBaseRow({
          systemCode: createNullSys,
          subSystemCode: createNullSub,
          tagname: createNullTag,
          phdTagno: "EXCEL_SHOULD_NOT_WIN",
        });

        const createNullResult = await postImport(baseUrl, buildCatalogWorkbook([createNullRow]), false);
        assert.equal(createNullResult.status, 200);

        const [nullCreated] = await db
          .select({
            phdTagNo: phdTag.phdTagNo,
            phdUnit: phdTag.phdUnit,
            phdDataType: phdTag.phdDataType,
            phdAssetName: phdTag.phdAssetName,
            phdDescription: phdTag.phdDescription,
          })
          .from(phdTag)
          .where(eq(phdTag.tagname, createNullTag));

        assert.equal(nullCreated?.phdTagNo, null);
        assert.equal(nullCreated?.phdUnit, null);
        assert.equal(nullCreated?.phdDataType, null);
      } finally {
        await stopServer(server);
      }
    }

    mockOdbc.reset();
    {
      const app = makeImportServer({
        PHD_METADATA_MODE: "optional",
        ODBC_API_URL: "http://mock-odbc",
      });
      const { server, baseUrl } = await startServer(app);
      try {
        const rollbackTagA = makeCode("P5C1_TAG_ROLL_A");
        const rollbackTagB = makeCode("P5C1_TAG_ROLL_B");
        const rollbackSysA = makeCode("P5C1_SYS_ROLL_A");
        const rollbackSysB = makeCode("P5C1_SYS_ROLL_B");
        const rollbackSubA = makeCode("P5C1_SUB_ROLL_A");
        const rollbackSubB = makeCode("P5C1_SUB_ROLL_B");
        const sharedNomenclature = makeCode("P5C1_NOM_SHARED");

        mockOdbc.set(rollbackTagA, {
          kind: "ok",
          payload: { TAGNAME: rollbackTagA, TAGNO: "11", DATA_TYPE_NAME: "DOUBLE" },
        });
        mockOdbc.set(rollbackTagB, {
          kind: "ok",
          payload: { TAGNAME: rollbackTagB, TAGNO: "12", DATA_TYPE_NAME: "DOUBLE" },
        });

        const rows = [
          buildBaseRow({
            systemCode: rollbackSysA,
            subSystemCode: rollbackSubA,
            tagname: rollbackTagA,
            nomenclature: sharedNomenclature,
          }),
          buildBaseRow({
            systemCode: rollbackSysB,
            subSystemCode: rollbackSubB,
            tagname: rollbackTagB,
            nomenclature: sharedNomenclature,
          }),
        ];

        const result = await postImport(baseUrl, buildCatalogWorkbook(rows), false);
        assert.equal(result.status, 500);
        assert.equal(mockOdbc.calls.includes(rollbackTagA), true);
        assert.equal(mockOdbc.calls.includes(rollbackTagB), true);

        const persistedSystems = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(phdSystemEntity)
          .where(inArray(phdSystemEntity.code, [rollbackSysA, rollbackSysB]));
        assert.equal(Number(persistedSystems[0]?.c ?? 0), 0);
      } finally {
        await stopServer(server);
      }
    }

    console.log(
      "phase5c-phd-metadata.integration: OK",
      JSON.stringify({
        checks: {
          disabledNoOdbc: true,
          optionalWarningsAndContinuity: true,
          requiredAbortWithoutWrites: true,
          precedenceAndPersistenceRules: true,
          concurrencyRespected: true,
          maxTagsRespected: true,
          metadataBeforeTransaction: true,
        },
      })
    );
  } finally {
    globalThis.fetch = originalFetch;

    await deleteByLists({
      tagNames: tracked.tags,
      subCodes: tracked.subs,
      systemCodes: tracked.systems,
      groupNames: tracked.groups,
    });

    await pool.end();
  }
}

run().catch((error) => {
  console.error("phase5c-phd-metadata.integration: FAILED", error);
  process.exit(1);
});
