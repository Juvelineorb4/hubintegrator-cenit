import { HttpError } from "./http-error";

const PG_UNIQUE_VIOLATION = "23505";

export function mapPgErrorToHttp(error: unknown, fallbackMessage: string): HttpError {
  const code = (error as { code?: string } | undefined)?.code;

  if (code === PG_UNIQUE_VIOLATION) {
    return new HttpError(409, fallbackMessage);
  }

  return new HttpError(500, "Internal server error", false);
}
