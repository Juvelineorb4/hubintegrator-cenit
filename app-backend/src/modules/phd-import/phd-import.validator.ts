import { parsePublicTagCategory } from "../../shared/phd/tag-category";
import {
  ImportValidationError,
  NormalizedCatalogRow,
  ParsedWorkbook,
  REQUIRED_COLUMNS,
  ValidationIssue,
} from "./phd-import.types";

const VALID_SYSTEM_TYPES = new Set(["OIL_PIPELINE", "PRODUCT_PIPELINE"]);
const VALID_PHD_TYPES = new Set(["DOUBLE", "STRING", "BOOLEAN", "BINARY", "INTEGER", "FLOAT"]);

export class PhdImportValidator {
  validateWorkbook(parsed: ParsedWorkbook): NormalizedCatalogRow[] {
    const errors: ValidationIssue[] = [];

    if (!parsed.headers.length) {
      errors.push({ row: 1, field: "sheet", value: "catalog", reason: "Sheet 'catalog' is required" });
      throw new ImportValidationError(errors);
    }

    for (const column of REQUIRED_COLUMNS) {
      if (!parsed.headers.includes(column)) {
        errors.push({ row: 1, field: column, value: null, reason: "Required column is missing" });
      }
    }

    const normalizedRows: NormalizedCatalogRow[] = [];

    const systemCodeMap = new Map<string, { name: string; type: string; row: number }>();
    const subSystemCodeMap = new Map<string, { name: string; nomenclature: string; row: number }>();
    const tagMap = new Map<string, { systemCode: string; subSystemCode: string; row: number }>();

    for (const row of parsed.rows) {
      const valueOf = (field: string): string => {
        const value = row.raw[field];
        if (value === null || value === undefined) {
          return "";
        }
        return String(value).trim();
      };

      const allValues = Object.values(row.raw).map((value) => String(value ?? "").trim());
      const emptyRow = allValues.every((value) => !value);
      if (emptyRow) {
        errors.push({ row: row.rowNumber, field: "row", value: null, reason: "Empty row" });
        continue;
      }

      const systemName = valueOf("systemName");
      const systemCode = valueOf("systemCode");
      const systemType = valueOf("systemType").toUpperCase();
      const subSystemName = valueOf("subSystemName");
      const subSystemCode = valueOf("subSystemCode");
      const nomenclature = valueOf("nomenclature");
      const tagname = valueOf("tagname");
      const category = valueOf("category").toUpperCase();
      const phdDataTypeName = valueOf("phdDataTypeName").toUpperCase();

      if (!systemCode) {
        errors.push({ row: row.rowNumber, field: "systemCode", value: null, reason: "Required value is missing" });
      }
      if (!subSystemCode) {
        errors.push({ row: row.rowNumber, field: "subSystemCode", value: null, reason: "Required value is missing" });
      }
      if (!tagname) {
        errors.push({ row: row.rowNumber, field: "tagname", value: null, reason: "Required value is missing" });
      }

      if (!VALID_SYSTEM_TYPES.has(systemType)) {
        errors.push({ row: row.rowNumber, field: "systemType", value: systemType || null, reason: "Unsupported systemType" });
      }

      if (!VALID_PHD_TYPES.has(phdDataTypeName)) {
        errors.push({ row: row.rowNumber, field: "phdDataTypeName", value: phdDataTypeName || null, reason: "Unsupported phdDataTypeName" });
      }

      let parsedCategory: ReturnType<typeof parsePublicTagCategory> | null = null;
      try {
        parsedCategory = parsePublicTagCategory(category);
      } catch {
        errors.push({ row: row.rowNumber, field: "category", value: category || null, reason: "Unsupported category" });
      }

      const parseNumeric = (field: "distance" | "latitude" | "longitude"): string | null => {
        const raw = valueOf(field);
        if (!raw) {
          return null;
        }
        if (!Number.isFinite(Number(raw))) {
          errors.push({ row: row.rowNumber, field, value: raw, reason: "Invalid numeric format" });
          return null;
        }
        return raw;
      };

      const distance = parseNumeric("distance");
      const latitude = parseNumeric("latitude");
      const longitude = parseNumeric("longitude");

      const rawDisplayOrder = valueOf("displayOrder");
      let displayOrder: number | null = null;
      if (rawDisplayOrder) {
        const parsedDisplayOrder = Number(rawDisplayOrder);
        if (!Number.isInteger(parsedDisplayOrder) || parsedDisplayOrder <= 0) {
          errors.push({ row: row.rowNumber, field: "displayOrder", value: rawDisplayOrder, reason: "displayOrder must be a positive integer" });
        } else {
          displayOrder = parsedDisplayOrder;
        }
      }

      if (systemCode) {
        const existing = systemCodeMap.get(systemCode);
        if (!existing) {
          systemCodeMap.set(systemCode, { name: systemName, type: systemType, row: row.rowNumber });
        } else if (existing.name !== systemName || existing.type !== systemType) {
          errors.push({ row: row.rowNumber, field: "systemCode", value: systemCode, reason: "Contradictory system data for same systemCode" });
        }
      }

      if (subSystemCode) {
        const existing = subSystemCodeMap.get(subSystemCode);
        if (!existing) {
          subSystemCodeMap.set(subSystemCode, { name: subSystemName, nomenclature, row: row.rowNumber });
        } else {
          if (existing.name !== subSystemName) {
            errors.push({ row: row.rowNumber, field: "subSystemCode", value: subSystemCode, reason: "Contradictory sub-system name for same subSystemCode" });
          }
          if (existing.nomenclature !== nomenclature) {
            errors.push({ row: row.rowNumber, field: "nomenclature", value: nomenclature || null, reason: "Contradictory nomenclature for same subSystemCode" });
          }
        }
      }

      if (tagname) {
        const existing = tagMap.get(tagname);
        if (!existing) {
          tagMap.set(tagname, { systemCode, subSystemCode, row: row.rowNumber });
        } else {
          errors.push({ row: row.rowNumber, field: "tagname", value: tagname, reason: "Duplicate tagname in file" });
          if (existing.systemCode !== systemCode || existing.subSystemCode !== subSystemCode) {
            errors.push({ row: row.rowNumber, field: "tagname", value: tagname, reason: "tagname maps to different system/sub-system" });
          }
        }
      }

      if (parsedCategory && VALID_SYSTEM_TYPES.has(systemType) && VALID_PHD_TYPES.has(phdDataTypeName) && systemCode && subSystemCode && tagname) {
        normalizedRows.push({
          rowNumber: row.rowNumber,
          systemName,
          systemCode,
          systemType: systemType as "OIL_PIPELINE" | "PRODUCT_PIPELINE",
          systemDescription: valueOf("systemDescription") || null,
          distance,
          subSystemName,
          subSystemCode,
          nomenclature,
          subSystemDescription: valueOf("subSystemDescription") || null,
          latitude,
          longitude,
          displayOrder,
          tagname,
          description: valueOf("description") || null,
          category: category as NormalizedCatalogRow["category"],
          phdTagno: valueOf("phdTagno") || tagname,
          phdUnit: valueOf("phdUnit") || null,
          phdDataTypeName: phdDataTypeName as NormalizedCatalogRow["phdDataTypeName"],
          phdAssetName: valueOf("phdAssetName") || null,
          phdDescription: valueOf("phdDescription") || null,
          measurementType: parsedCategory.measurementType,
          role: parsedCategory.role,
          qualifier: parsedCategory.qualifier,
        });
      }
    }

    if (errors.length) {
      throw new ImportValidationError(errors);
    }

    return normalizedRows;
  }
}
