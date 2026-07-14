import { db, DrizzleDB } from "../../core/db/drizzle/client";
import { HttpError } from "../../shared/errors/http-error";
import { PhdMetadataClient, PhdMetadataClientError } from "./phd-metadata.client";
import { PhdMetadataRuntimeConfig } from "./phd-metadata.config";
import {
  ImportSummary,
  ImportValidationError,
  PhdMetadataMode,
  PhdMetadataSummary,
  ValidationIssue,
} from "./phd-import.types";
import { PhdImportParser } from "./phd-import.parser";
import { PhdImportValidator } from "./phd-import.validator";
import { PhdImportRepository } from "./phd-import.repository";

const VALID_PHD_TYPES = new Set(["DOUBLE", "STRING", "BOOLEAN", "BINARY", "INTEGER", "FLOAT"]);

type CanonicalTag = {
  key: string;
  requestedTagname: string;
  rowNumber: number;
};

function normalizeTagname(value: string): string {
  return value.trim().toLowerCase();
}

function buildInitialMetadataSummary(mode: PhdMetadataMode): PhdMetadataSummary {
  return {
    mode,
    tagsRequested: 0,
    tagsFound: 0,
    tagsNotFound: 0,
    complete: 0,
    partial: 0,
    failed: 0,
    fieldsNull: {
      phdTagno: 0,
      phdUnit: 0,
      phdDataTypeName: 0,
      phdAssetName: 0,
      phdDescription: 0,
    },
    warnings: [],
  };
}

function areEquivalentMetadataRows(
  left: { phdTagno: string | null; phdUnit: string | null; phdDataTypeName: string | null; phdAssetName: string | null; phdDescription: string | null },
  right: { phdTagno: string | null; phdUnit: string | null; phdDataTypeName: string | null; phdAssetName: string | null; phdDescription: string | null }
): boolean {
  return (
    (left.phdTagno ?? null) === (right.phdTagno ?? null) &&
    (left.phdUnit ?? null) === (right.phdUnit ?? null) &&
    (left.phdDataTypeName ?? null) === (right.phdDataTypeName ?? null) &&
    (left.phdAssetName ?? null) === (right.phdAssetName ?? null) &&
    (left.phdDescription ?? null) === (right.phdDescription ?? null)
  );
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;

  const runWorker = async (): Promise<void> => {
    while (true) {
      const current = cursor;
      cursor += 1;

      if (current >= items.length) {
        return;
      }

      await worker(items[current]);
    }
  };

  const parallel = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(parallel);
}

export class PhdImportService {
  constructor(
    private parser: PhdImportParser,
    private validator: PhdImportValidator,
    private repository: PhdImportRepository,
    private metadataConfig: PhdMetadataRuntimeConfig,
    private metadataClient: PhdMetadataClient | null
  ) {}

  private collectCanonicalTags(tagNames: Array<{ tagname: string; rowNumber: number }>): CanonicalTag[] {
    const unique = new Map<string, CanonicalTag>();
    for (const row of tagNames) {
      const key = normalizeTagname(row.tagname);
      if (!unique.has(key)) {
        unique.set(key, {
          key,
          requestedTagname: row.tagname.trim(),
          rowNumber: row.rowNumber,
        });
      }
    }

    return [...unique.values()];
  }

  private metadataIssue(tag: CanonicalTag, reason: string): ValidationIssue {
    return {
      sheet: "catalog",
      row: tag.rowNumber,
      field: "tagname",
      value: tag.requestedTagname,
      reason,
    };
  }

  private applyPhdMetadataToRows(
    rows: Array<{
      rowNumber: number;
      tagname: string;
      phdTagno: string | null;
      phdUnit: string | null;
      phdDataTypeName: "DOUBLE" | "STRING" | "BOOLEAN" | "BINARY" | "INTEGER" | "FLOAT" | null;
      phdAssetName: string | null;
      phdDescription: string | null;
      hasExplicitPhdTagno: boolean;
      hasExplicitPhdUnit: boolean;
      hasExplicitPhdDataTypeName: boolean;
      hasExplicitPhdAssetName: boolean;
      hasExplicitPhdDescription: boolean;
    }>,
    key: string,
    metadata: {
      phdTagno: string | null;
      phdUnit: string | null;
      phdDataTypeName: "DOUBLE" | "STRING" | "BOOLEAN" | "BINARY" | "INTEGER" | "FLOAT" | null;
      phdAssetName: string | null;
      phdDescription: string | null;
    },
    summary: PhdMetadataSummary
  ): void {
    for (const row of rows) {
      if (normalizeTagname(row.tagname) !== key) {
        continue;
      }

      if (metadata.phdTagno && row.hasExplicitPhdTagno && row.phdTagno !== metadata.phdTagno) {
        summary.warnings.push(`Tag ${row.tagname}: PHD metadata phdTagno overrides Excel value`);
      }
      if (metadata.phdUnit && row.hasExplicitPhdUnit && row.phdUnit !== metadata.phdUnit) {
        summary.warnings.push(`Tag ${row.tagname}: PHD metadata phdUnit overrides Excel value`);
      }
      if (metadata.phdDataTypeName && row.hasExplicitPhdDataTypeName && row.phdDataTypeName !== metadata.phdDataTypeName) {
        summary.warnings.push(`Tag ${row.tagname}: PHD metadata phdDataTypeName overrides Excel value`);
      }
      if (metadata.phdAssetName && row.hasExplicitPhdAssetName && row.phdAssetName !== metadata.phdAssetName) {
        summary.warnings.push(`Tag ${row.tagname}: PHD metadata phdAssetName overrides Excel value`);
      }
      if (metadata.phdDescription && row.hasExplicitPhdDescription && row.phdDescription !== metadata.phdDescription) {
        summary.warnings.push(`Tag ${row.tagname}: PHD metadata phdDescription overrides Excel value`);
      }

      row.phdTagno = metadata.phdTagno;
      row.hasExplicitPhdTagno = Boolean(metadata.phdTagno);

      row.phdUnit = metadata.phdUnit;
      row.hasExplicitPhdUnit = Boolean(metadata.phdUnit);

      row.phdDataTypeName = metadata.phdDataTypeName;
      row.hasExplicitPhdDataTypeName = Boolean(metadata.phdDataTypeName);

      row.phdAssetName = metadata.phdAssetName;
      row.hasExplicitPhdAssetName = Boolean(metadata.phdAssetName);

      row.phdDescription = metadata.phdDescription;
      row.hasExplicitPhdDescription = Boolean(metadata.phdDescription);
    }
  }

  private async enrichWithPhdMetadata(
    rows: Array<{
      rowNumber: number;
      tagname: string;
      phdTagno: string | null;
      phdUnit: string | null;
      phdDataTypeName: "DOUBLE" | "STRING" | "BOOLEAN" | "BINARY" | "INTEGER" | "FLOAT" | null;
      phdAssetName: string | null;
      phdDescription: string | null;
      hasExplicitPhdTagno: boolean;
      hasExplicitPhdUnit: boolean;
      hasExplicitPhdDataTypeName: boolean;
      hasExplicitPhdAssetName: boolean;
      hasExplicitPhdDescription: boolean;
    }>,
    summary: PhdMetadataSummary
  ): Promise<void> {
    const mode = this.metadataConfig.mode;
    if (mode === "disabled") {
      return;
    }

    if (!this.metadataClient) {
      throw new HttpError(500, "Invalid PHD metadata configuration", false);
    }

    const canonicalTags = this.collectCanonicalTags(rows.map((row) => ({ tagname: row.tagname, rowNumber: row.rowNumber })));
    if (canonicalTags.length > this.metadataConfig.maxTags) {
      throw new HttpError(400, "Tag limit exceeded for PHD metadata enrichment");
    }

    summary.tagsRequested = canonicalTags.length;

    const issues: ValidationIssue[] = [];

    await runWithConcurrency(canonicalTags, this.metadataConfig.concurrency, async (tag) => {
      let browseRows;
      try {
        browseRows = await this.metadataClient?.fetchBrowse(tag.requestedTagname);
      } catch (error) {
        summary.failed += 1;
        const reason = error instanceof PhdMetadataClientError ? error.reason : "odbc_http_error";
        const semanticReason =
          reason === "odbc_timeout"
            ? "PHD metadata timeout"
            : reason === "odbc_invalid_json"
              ? "PHD metadata invalid JSON"
              : "PHD metadata request failed";

        if (mode === "required") {
          issues.push(this.metadataIssue(tag, semanticReason));
        } else {
          summary.warnings.push(`Tag ${tag.requestedTagname}: ${semanticReason}`);
        }
        return;
      }

      const matching = (browseRows ?? []).filter((row) => {
        if (!row.tagname) {
          return false;
        }
        return normalizeTagname(row.tagname) === tag.key;
      });

      if (matching.length === 0) {
        summary.tagsNotFound += 1;
        const mismatchPayload = (browseRows ?? []).length > 0;
        const reason = mismatchPayload ? "PHD metadata tagname mismatch" : "PHD metadata tag not found";

        if (mode === "required") {
          issues.push(this.metadataIssue(tag, reason));
        } else {
          summary.warnings.push(`Tag ${tag.requestedTagname}: ${reason}`);
        }
        return;
      }

      const base = matching[0];
      const contradictory = matching.some((row) => !areEquivalentMetadataRows(base, row));
      if (contradictory) {
        summary.failed += 1;
        if (mode === "required") {
          issues.push(this.metadataIssue(tag, "PHD metadata contains contradictory rows"));
        } else {
          summary.warnings.push(`Tag ${tag.requestedTagname}: PHD metadata contains contradictory rows`);
        }
        return;
      }

      const normalizedType = base.phdDataTypeName ? base.phdDataTypeName.toUpperCase() : null;
      const validType = !normalizedType || VALID_PHD_TYPES.has(normalizedType);
      if (!validType) {
        summary.failed += 1;
        if (mode === "required") {
          issues.push(this.metadataIssue(tag, "PHD metadata data type is not supported"));
        } else {
          summary.warnings.push(`Tag ${tag.requestedTagname}: PHD metadata data type is not supported`);
        }
        return;
      }

      const normalizedMetadata = {
        phdTagno: base.phdTagno,
        phdUnit: base.phdUnit,
        phdDataTypeName: (normalizedType as
          | "DOUBLE"
          | "STRING"
          | "BOOLEAN"
          | "BINARY"
          | "INTEGER"
          | "FLOAT"
          | null),
        phdAssetName: base.phdAssetName,
        phdDescription: base.phdDescription,
      };

      summary.tagsFound += 1;

      const populated = [
        normalizedMetadata.phdTagno,
        normalizedMetadata.phdUnit,
        normalizedMetadata.phdDataTypeName,
        normalizedMetadata.phdAssetName,
        normalizedMetadata.phdDescription,
      ].filter((value) => value !== null).length;

      if (populated === 5) {
        summary.complete += 1;
      } else {
        summary.partial += 1;
      }

      if (normalizedMetadata.phdTagno === null) summary.fieldsNull.phdTagno += 1;
      if (normalizedMetadata.phdUnit === null) summary.fieldsNull.phdUnit += 1;
      if (normalizedMetadata.phdDataTypeName === null) summary.fieldsNull.phdDataTypeName += 1;
      if (normalizedMetadata.phdAssetName === null) summary.fieldsNull.phdAssetName += 1;
      if (normalizedMetadata.phdDescription === null) summary.fieldsNull.phdDescription += 1;

      this.applyPhdMetadataToRows(rows, tag.key, normalizedMetadata, summary);
    });

    if (issues.length > 0) {
      throw new ImportValidationError(issues);
    }
  }

  async importCatalog(file: Express.Multer.File | undefined, dryRun: boolean): Promise<ImportSummary> {
    if (!file) {
      throw new HttpError(400, "Missing required file field");
    }

    if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
      throw new HttpError(400, "Only .xlsx files are supported");
    }

    if (!file.buffer?.length) {
      throw new HttpError(400, "File is empty");
    }

    const parsed = this.parser.parseCatalogWorkbook(file.buffer);
    const normalized = this.validator.validateWorkbook(parsed);
    const metadataSummary = buildInitialMetadataSummary(this.metadataConfig.mode);

    const uniqueTags = this.collectCanonicalTags(
      normalized.catalogRows.map((row) => ({ tagname: row.tagname, rowNumber: row.rowNumber }))
    );

    if (uniqueTags.length > this.metadataConfig.maxTags) {
      throw new HttpError(400, "Tag limit exceeded for PHD metadata enrichment");
    }

    if (this.metadataConfig.mode !== "disabled") {
      await this.enrichWithPhdMetadata(normalized.catalogRows, metadataSummary);
    }

    return db.transaction(async (tx) => {
      try {
        return await this.repository.importCatalog(tx as unknown as DrizzleDB, normalized, dryRun, metadataSummary);
      } catch (error) {
        if (error instanceof ImportValidationError || error instanceof HttpError) {
          throw error;
        }
        throw new HttpError(500, "Internal server error", false);
      }
    });
  }
}
