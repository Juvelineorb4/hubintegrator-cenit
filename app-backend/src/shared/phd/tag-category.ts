export type TagMeasurementType =
  | "FLOW"
  | "PRESSURE"
  | "LEVEL"
  | "VOLUME"
  | "SELECTOR";

export type TagRole = "NONE" | "IN" | "OUT" | "S_E";

export type TagQualifier = "NORMAL" | "MAX";

export type PublicTagCategory =
  | "FLOW_IN"
  | "FLOW_OUT"
  | "PRESSURE_IN"
  | "PRESSURE_OUT"
  | "PRESSURE_IN_MAX"
  | "PRESSURE_OUT_MAX"
  | "LEVEL"
  | "VOLUME"
  | "SELECTOR_S_E";

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

const PUBLIC_TO_INTERNAL_MAP: Record<PublicTagCategory, {
  measurementType: TagMeasurementType;
  role: TagRole;
  qualifier: TagQualifier;
}> = {
  FLOW_IN: { measurementType: "FLOW", role: "IN", qualifier: "NORMAL" },
  FLOW_OUT: { measurementType: "FLOW", role: "OUT", qualifier: "NORMAL" },
  PRESSURE_IN: { measurementType: "PRESSURE", role: "IN", qualifier: "NORMAL" },
  PRESSURE_OUT: { measurementType: "PRESSURE", role: "OUT", qualifier: "NORMAL" },
  PRESSURE_IN_MAX: { measurementType: "PRESSURE", role: "IN", qualifier: "MAX" },
  PRESSURE_OUT_MAX: { measurementType: "PRESSURE", role: "OUT", qualifier: "MAX" },
  LEVEL: { measurementType: "LEVEL", role: "NONE", qualifier: "NORMAL" },
  VOLUME: { measurementType: "VOLUME", role: "NONE", qualifier: "NORMAL" },
  SELECTOR_S_E: { measurementType: "SELECTOR", role: "S_E", qualifier: "NORMAL" },
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

export function parsePublicTagCategory(category: string): {
  measurementType: TagMeasurementType;
  role: TagRole;
  qualifier: TagQualifier;
} {
  const normalized = category.trim().toUpperCase() as PublicTagCategory;
  const mapped = PUBLIC_TO_INTERNAL_MAP[normalized];

  if (!mapped) {
    throw new Error(`Unsupported public tag category: ${category}`);
  }

  return mapped;
}
