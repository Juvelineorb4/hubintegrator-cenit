import { HttpError } from "../../shared/errors/http-error";

export const REQUIRED_COLUMNS = [
  "systemName",
  "systemCode",
  "systemType",
  "subSystemName",
  "subSystemCode",
  "nomenclature",
  "tagname",
  "category",
  "phdDataTypeName",
] as const;

export const OPTIONAL_COLUMNS = [
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
] as const;

export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;

export type CatalogColumn = (typeof ALL_COLUMNS)[number];

export type ValidationIssue = {
  row: number;
  field: string;
  value: string | null;
  reason: string;
};

export class ImportValidationError extends HttpError {
  readonly errors: ValidationIssue[];

  constructor(errors: ValidationIssue[]) {
    super(400, "Import validation failed");
    this.errors = errors;
  }
}

export type ParsedCatalogRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
};

export type ParsedWorkbook = {
  headers: string[];
  rows: ParsedCatalogRow[];
};

export type NormalizedCatalogRow = {
  rowNumber: number;
  systemName: string;
  systemCode: string;
  systemType: "OIL_PIPELINE" | "PRODUCT_PIPELINE";
  systemDescription: string | null;
  distance: string | null;
  subSystemName: string;
  subSystemCode: string;
  nomenclature: string;
  subSystemDescription: string | null;
  latitude: string | null;
  longitude: string | null;
  displayOrder: number | null;
  tagname: string;
  description: string | null;
  category: "FLOW_IN" | "FLOW_OUT" | "PRESSURE_IN" | "PRESSURE_OUT" | "PRESSURE_IN_MAX" | "PRESSURE_OUT_MAX" | "LEVEL" | "VOLUME" | "SELECTOR_S_E";
  phdTagno: string;
  phdUnit: string | null;
  phdDataTypeName: "DOUBLE" | "STRING" | "BOOLEAN" | "BINARY" | "INTEGER" | "FLOAT";
  phdAssetName: string | null;
  phdDescription: string | null;
  measurementType: "FLOW" | "PRESSURE" | "LEVEL" | "VOLUME" | "SELECTOR";
  role: "NONE" | "IN" | "OUT" | "S_E";
  qualifier: "NORMAL" | "MAX";
};

export type ImportSummary = {
  dryRun: boolean;
  rowsProcessed: number;
  systems: { created: number; updated: number; skipped: number };
  subsystems: { created: number; updated: number; skipped: number };
  relations: { created: number; updated: number; skipped: number };
  tags: { created: number; updated: number; skipped: number };
  errors: ValidationIssue[];
};
