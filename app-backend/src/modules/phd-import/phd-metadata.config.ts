import { HttpError } from "../../shared/errors/http-error";
import { PhdMetadataMode } from "./phd-import.types";

export type PhdMetadataRuntimeConfig = {
  mode: PhdMetadataMode;
  concurrency: number;
  maxTags: number;
  odbcApiUrl: string;
  connectTimeoutSeconds: number;
  readTimeoutSeconds: number;
};

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return Number.NaN;
  }

  return parsed;
}

export function resolvePhdMetadataConfig(env: NodeJS.ProcessEnv): PhdMetadataRuntimeConfig {
  const modeRaw = String(env.PHD_METADATA_MODE ?? "disabled").trim().toLowerCase();
  if (modeRaw !== "disabled" && modeRaw !== "optional" && modeRaw !== "required") {
    throw new HttpError(500, "Invalid PHD metadata configuration", false);
  }

  const concurrency = parseInteger(env.PHD_METADATA_CONCURRENCY, 5);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) {
    throw new HttpError(500, "Invalid PHD metadata configuration", false);
  }

  const maxTags = parseInteger(env.PHD_METADATA_MAX_TAGS, 1000);
  if (!Number.isInteger(maxTags) || maxTags <= 0) {
    throw new HttpError(500, "Invalid PHD metadata configuration", false);
  }

  const connectTimeoutSeconds = parseInteger(env.ODBC_CONNECT_TIMEOUT_SECONDS, 10);
  const readTimeoutSeconds = parseInteger(env.ODBC_READ_TIMEOUT_SECONDS, 120);

  if (!Number.isInteger(connectTimeoutSeconds) || connectTimeoutSeconds <= 0) {
    throw new HttpError(500, "Invalid PHD metadata configuration", false);
  }

  if (!Number.isInteger(readTimeoutSeconds) || readTimeoutSeconds <= 0) {
    throw new HttpError(500, "Invalid PHD metadata configuration", false);
  }

  const odbcApiUrl = String(env.ODBC_API_URL ?? "").trim();
  if ((modeRaw === "optional" || modeRaw === "required") && !odbcApiUrl) {
    throw new HttpError(500, "Invalid PHD metadata configuration", false);
  }

  return {
    mode: modeRaw as PhdMetadataMode,
    concurrency,
    maxTags,
    odbcApiUrl,
    connectTimeoutSeconds,
    readTimeoutSeconds,
  };
}
