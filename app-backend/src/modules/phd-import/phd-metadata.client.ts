import { HttpError } from "../../shared/errors/http-error";

export type PhdMetadataClientConfig = {
  baseUrl: string;
  connectTimeoutSeconds: number;
  readTimeoutSeconds: number;
};

export type NormalizedBrowseRow = {
  tagname: string | null;
  phdTagno: string | null;
  phdUnit: string | null;
  phdDataTypeName: string | null;
  phdAssetName: string | null;
  phdDescription: string | null;
};

export class PhdMetadataClientError extends HttpError {
  readonly reason:
    | "odbc_http_error"
    | "odbc_timeout"
    | "odbc_invalid_json"
    | "odbc_invalid_payload";

  constructor(
    reason: "odbc_http_error" | "odbc_timeout" | "odbc_invalid_json" | "odbc_invalid_payload",
    message: string
  ) {
    super(502, message);
    this.reason = reason;
  }
}

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function getCaseInsensitive(raw: Record<string, unknown>, keys: string[]): unknown {
  const lowerToValue = new Map<string, unknown>();
  for (const [key, value] of Object.entries(raw)) {
    lowerToValue.set(key.toLowerCase(), value);
  }

  for (const key of keys) {
    if (lowerToValue.has(key.toLowerCase())) {
      return lowerToValue.get(key.toLowerCase());
    }
  }

  return null;
}

function normalizeRow(raw: Record<string, unknown>): NormalizedBrowseRow {
  return {
    tagname: normalizeString(getCaseInsensitive(raw, ["TAGNAME", "tagname"])),
    phdTagno: normalizeString(getCaseInsensitive(raw, ["TAGNO", "tagno"])),
    phdUnit: normalizeString(getCaseInsensitive(raw, ["UNITS", "units", "UNIT", "unit"])),
    phdDataTypeName: normalizeString(
      getCaseInsensitive(raw, ["DATA_TYPE_NAME", "data_type_name", "dataTypeName"])
    ),
    phdAssetName: normalizeString(getCaseInsensitive(raw, ["ASSET_NAME", "asset_name", "assetName"])),
    phdDescription: normalizeString(getCaseInsensitive(raw, ["DESCRIPTION", "description"])),
  };
}

function parsePayload(payload: unknown): NormalizedBrowseRow[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => normalizeRow(item));
  }

  if (typeof payload === "object" && payload !== null) {
    return [normalizeRow(payload as Record<string, unknown>)];
  }

  throw new PhdMetadataClientError("odbc_invalid_payload", "Invalid PHD metadata payload");
}

export class PhdMetadataClient {
  constructor(private readonly config: PhdMetadataClientConfig) {}

  private buildUrl(tagname: string): string {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    return `${base}/tags/${encodeURIComponent(tagname)}/browse`;
  }

  async fetchBrowse(tagname: string): Promise<NormalizedBrowseRow[]> {
    const timeoutMs = (this.config.connectTimeoutSeconds + this.config.readTimeoutSeconds) * 1000;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.buildUrl(tagname), {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new PhdMetadataClientError("odbc_http_error", `PHD metadata request failed with status ${response.status}`);
      }

      const text = await response.text();
      let payload: unknown;
      try {
        payload = text ? JSON.parse(text) : [];
      } catch {
        throw new PhdMetadataClientError("odbc_invalid_json", "PHD metadata response is not valid JSON");
      }

      return parsePayload(payload);
    } catch (error) {
      if (error instanceof PhdMetadataClientError) {
        throw error;
      }

      if ((error as { name?: string } | undefined)?.name === "AbortError") {
        throw new PhdMetadataClientError("odbc_timeout", "PHD metadata request timed out");
      }

      throw new PhdMetadataClientError("odbc_http_error", "PHD metadata request failed");
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
