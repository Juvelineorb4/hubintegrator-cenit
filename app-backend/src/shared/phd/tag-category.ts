export type TagMeasurementType =
  | "FLOW"
  | "PRESSURE"
  | "LEVEL"
  | "VOLUME"
  | "SELECTOR";

export type TagRole = "NONE" | "IN" | "OUT" | "S_E";

export type TagQualifier = "NORMAL" | "MAX";

const CATEGORY_MAP: Record<string, string> = {
  "FLOW|IN|NORMAL": "FLOW_IN",
  "FLOW|OUT|NORMAL": "FLOW_OUT",
  "PRESSURE|IN|NORMAL": "PRESSURE_IN",
  "PRESSURE|OUT|NORMAL": "PRESSURE_OUT",
  "PRESSURE|IN|MAX": "PRESSURE_IN_MAX",
  "PRESSURE|OUT|MAX": "PRESSURE_OUT_MAX",
  "LEVEL|NONE|NORMAL": "LEVEL",
  "VOLUME|NONE|NORMAL": "VOLUME",
  "SELECTOR|S_E|NORMAL": "SELECTOR_S_E",
};

export function derivePublicTagCategory(
  measurementType: TagMeasurementType,
  role: TagRole,
  qualifier: TagQualifier
): string {
  const key = `${measurementType}|${role}|${qualifier}`;
  const category = CATEGORY_MAP[key];

  if (!category) {
    throw new Error(`Unsupported tag category combination: ${key}`);
  }

  return category;
}
