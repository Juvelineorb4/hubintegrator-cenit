import { parsePublicTagCategory } from "../../shared/phd/tag-category";
import {
  ALL_SYSTEM_GROUP_COLUMNS,
  OPTIONAL_COLUMNS,
  ImportValidationError,
  NormalizedCatalogRow,
  NormalizedSystemGroupRow,
  NormalizedWorkbook,
  ParsedWorkbook,
  REQUIRED_SYSTEM_GROUP_COLUMNS,
  REQUIRED_COLUMNS,
  ValidationIssue,
} from "./phd-import.types";

const VALID_SYSTEM_TYPES = new Set(["OIL_PIPELINE", "PRODUCT_PIPELINE"]);
const VALID_PHD_TYPES = new Set(["DOUBLE", "STRING", "BOOLEAN", "BINARY", "INTEGER", "FLOAT"]);

export class PhdImportValidator {
  validateWorkbook(parsed: ParsedWorkbook): NormalizedWorkbook {
    const errors: ValidationIssue[] = [];

    if (!parsed.catalog.headers.length) {
      errors.push({ row: 1, field: "sheet", value: "catalog", reason: "Sheet 'catalog' is required" });
      throw new ImportValidationError(errors);
    }

    for (const column of REQUIRED_COLUMNS) {
      if (!parsed.catalog.headers.includes(column)) {
        errors.push({ row: 1, field: column, value: null, reason: "Required column is missing" });
      }
    }

    const normalizedRows: NormalizedCatalogRow[] = [];
    const recognizedColumns = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
    const presentRecognizedHeaders = parsed.catalog.headers.filter((header) => recognizedColumns.has(header));

    const systemCodeMap = new Map<string, { name: string; type: string; row: number }>();
    const subSystemCodeMap = new Map<string, { name: string; nomenclature: string; row: number }>();
    const tagMap = new Map<string, { systemCode: string; subSystemCode: string; row: number }>();

    for (const row of parsed.catalog.rows) {
      const valueOf = (field: string): string => {
        const value = row.raw[field];
        if (value === null || value === undefined) {
          return "";
        }
        return String(value).trim();
      };

      const recognizedValues = presentRecognizedHeaders.map((header) => String(row.raw[header] ?? "").trim());
      const emptyRow = recognizedValues.every((value) => !value);
      if (emptyRow) {
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

      const rawPhdTagno = valueOf("phdTagno");
      const rawPhdUnit = valueOf("phdUnit");
      const rawPhdDataTypeName = valueOf("phdDataTypeName");
      const rawPhdAssetName = valueOf("phdAssetName");
      const rawPhdDescription = valueOf("phdDescription");

      const phdTagno = rawPhdTagno || null;
      const phdUnit = rawPhdUnit || null;
      const phdDataTypeName = rawPhdDataTypeName ? rawPhdDataTypeName.toUpperCase() : null;
      const phdAssetName = rawPhdAssetName || null;
      const phdDescription = rawPhdDescription || null;

      const hasExplicitPhdTagno = Boolean(rawPhdTagno);
      const hasExplicitPhdUnit = Boolean(rawPhdUnit);
      const hasExplicitPhdDataTypeName = Boolean(rawPhdDataTypeName);
      const hasExplicitPhdAssetName = Boolean(rawPhdAssetName);
      const hasExplicitPhdDescription = Boolean(rawPhdDescription);

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

      if (phdDataTypeName && !VALID_PHD_TYPES.has(phdDataTypeName)) {
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

      if (parsedCategory && VALID_SYSTEM_TYPES.has(systemType) && systemCode && subSystemCode && tagname) {
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
          phdTagno,
          phdUnit,
          phdDataTypeName: phdDataTypeName as NormalizedCatalogRow["phdDataTypeName"],
          phdAssetName,
          phdDescription,
          hasExplicitPhdTagno,
          hasExplicitPhdUnit,
          hasExplicitPhdDataTypeName,
          hasExplicitPhdAssetName,
          hasExplicitPhdDescription,
          measurementType: parsedCategory.measurementType,
          role: parsedCategory.role,
          qualifier: parsedCategory.qualifier,
        });
      }
    }

    const normalizedSystemGroupRows: NormalizedSystemGroupRow[] = [];
    if (parsed.systemGroups.present) {
      for (const column of REQUIRED_SYSTEM_GROUP_COLUMNS) {
        if (!parsed.systemGroups.headers.includes(column)) {
          errors.push({
            sheet: "system_groups",
            row: 1,
            field: column,
            value: null,
            reason: "Required column is missing",
          });
        }
      }

      const recognizedGroupColumns = new Set<string>([...ALL_SYSTEM_GROUP_COLUMNS]);
      const presentRecognizedGroupHeaders = parsed.systemGroups.headers.filter((header) => recognizedGroupColumns.has(header));

      const groupDefinitionMap = new Map<string, { row: number; groupDescription: string | null; groupDisplayOrder: number }>();
      const groupSystemSeen = new Set<string>();
      const groupDisplaySeen = new Set<string>();

      for (const row of parsed.systemGroups.rows) {
        const valueOf = (field: string): string => {
          const value = row.raw[field];
          if (value === null || value === undefined) {
            return "";
          }
          return String(value).trim();
        };

        const recognizedValues = presentRecognizedGroupHeaders.map((header) => String(row.raw[header] ?? "").trim());
        const emptyRow = recognizedValues.every((value) => !value);
        if (emptyRow) {
          continue;
        }

        const groupName = valueOf("groupName");
        const groupDescription = valueOf("groupDescription") || null;
        const groupDisplayOrderRaw = valueOf("groupDisplayOrder");
        const systemCode = valueOf("systemCode");
        const systemDisplayOrderRaw = valueOf("systemDisplayOrder");

        const missingRequired: string[] = [];
        if (!groupName) {
          missingRequired.push("groupName");
          errors.push({
            sheet: "system_groups",
            row: row.rowNumber,
            field: "groupName",
            value: null,
            reason: "Required value is missing",
          });
        }
        if (!groupDisplayOrderRaw) {
          missingRequired.push("groupDisplayOrder");
          errors.push({
            sheet: "system_groups",
            row: row.rowNumber,
            field: "groupDisplayOrder",
            value: null,
            reason: "Required value is missing",
          });
        }
        if (!systemCode) {
          missingRequired.push("systemCode");
          errors.push({
            sheet: "system_groups",
            row: row.rowNumber,
            field: "systemCode",
            value: null,
            reason: "Required value is missing",
          });
        }
        if (!systemDisplayOrderRaw) {
          missingRequired.push("systemDisplayOrder");
          errors.push({
            sheet: "system_groups",
            row: row.rowNumber,
            field: "systemDisplayOrder",
            value: null,
            reason: "Required value is missing",
          });
        }

        if (missingRequired.length > 0 && missingRequired.length < REQUIRED_SYSTEM_GROUP_COLUMNS.length) {
          errors.push({
            sheet: "system_groups",
            row: row.rowNumber,
            field: "row",
            value: null,
            reason: "Partially filled row",
          });
        }

        let groupDisplayOrder: number | null = null;
        if (groupDisplayOrderRaw) {
          const parsedOrder = Number(groupDisplayOrderRaw);
          if (!Number.isInteger(parsedOrder) || parsedOrder <= 0) {
            errors.push({
              sheet: "system_groups",
              row: row.rowNumber,
              field: "groupDisplayOrder",
              value: groupDisplayOrderRaw,
              reason: "groupDisplayOrder must be a positive integer",
            });
          } else {
            groupDisplayOrder = parsedOrder;
          }
        }

        let systemDisplayOrder: number | null = null;
        if (systemDisplayOrderRaw) {
          const parsedOrder = Number(systemDisplayOrderRaw);
          if (!Number.isInteger(parsedOrder) || parsedOrder <= 0) {
            errors.push({
              sheet: "system_groups",
              row: row.rowNumber,
              field: "systemDisplayOrder",
              value: systemDisplayOrderRaw,
              reason: "systemDisplayOrder must be a positive integer",
            });
          } else {
            systemDisplayOrder = parsedOrder;
          }
        }

        if (groupName && groupDisplayOrder !== null) {
          const existing = groupDefinitionMap.get(groupName);
          if (!existing) {
            groupDefinitionMap.set(groupName, {
              row: row.rowNumber,
              groupDescription,
              groupDisplayOrder,
            });
          } else {
            if (existing.groupDescription !== groupDescription || existing.groupDisplayOrder !== groupDisplayOrder) {
              errors.push({
                sheet: "system_groups",
                row: row.rowNumber,
                field: "groupName",
                value: groupName,
                reason: "Contradictory group data for same groupName",
              });
            }
          }
        }

        if (groupName && systemCode) {
          const memberKey = `${groupName}::${systemCode}`;
          if (groupSystemSeen.has(memberKey)) {
            errors.push({
              sheet: "system_groups",
              row: row.rowNumber,
              field: "systemCode",
              value: systemCode,
              reason: "Duplicate systemCode within group",
            });
          } else {
            groupSystemSeen.add(memberKey);
          }
        }

        if (groupName && systemDisplayOrder !== null) {
          const displayKey = `${groupName}::${systemDisplayOrder}`;
          if (groupDisplaySeen.has(displayKey)) {
            errors.push({
              sheet: "system_groups",
              row: row.rowNumber,
              field: "systemDisplayOrder",
              value: String(systemDisplayOrder),
              reason: "Duplicate systemDisplayOrder within group",
            });
          } else {
            groupDisplaySeen.add(displayKey);
          }
        }

        if (groupName && groupDisplayOrder !== null && systemCode && systemDisplayOrder !== null) {
          normalizedSystemGroupRows.push({
            rowNumber: row.rowNumber,
            groupName,
            groupDescription,
            groupDisplayOrder,
            systemCode,
            systemDisplayOrder,
          });
        }
      }
    }

    if (errors.length) {
      throw new ImportValidationError(errors);
    }

    return {
      catalogRows: normalizedRows,
      systemGroupRows: normalizedSystemGroupRows,
      hasSystemGroupsSheet: parsed.systemGroups.present,
    };
  }
}
