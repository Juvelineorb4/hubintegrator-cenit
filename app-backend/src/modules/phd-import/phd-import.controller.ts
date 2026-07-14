import { Request, Response } from "express";
import { HttpError, toSafeHttpError } from "../../shared/errors/http-error";
import { PhdImportService } from "./phd-import.service";
import { ImportValidationError } from "./phd-import.types";

export class PhdImportController {
  constructor(private service: PhdImportService) {}

  importCatalog = async (req: Request, res: Response): Promise<void> => {
    try {
      const dryRun = String(req.query.dryRun ?? "false").toLowerCase() === "true";
      const summary = await this.service.importCatalog(req.file, dryRun);
      res.status(200).json(summary);
    } catch (error) {
      if (error instanceof ImportValidationError) {
        res.status(400).json({ message: "Import validation failed", errors: error.errors });
        return;
      }

      const httpError = toSafeHttpError(error);
      const message = httpError.expose ? httpError.message : "Internal server error";
      if (httpError.statusCode === 400 || httpError.statusCode === 409 || httpError.statusCode === 500) {
        res.status(httpError.statusCode).json({ message, errors: [] });
        return;
      }

      res.status(500).json({ message: "Internal server error", errors: [] });
    }
  };

  uploadError = (error: unknown, _req: Request, res: Response, _next: () => void): void => {
    const code = (error as { code?: string } | undefined)?.code;
    if (code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ message: "File exceeds 10 MB limit", errors: [] });
      return;
    }

    const msg = (error as { message?: string } | undefined)?.message;
    if (msg) {
      res.status(400).json({ message: msg, errors: [] });
      return;
    }

    const httpError = toSafeHttpError(error);
    const message = httpError.expose ? httpError.message : "Internal server error";
    res.status(httpError.statusCode).json({ message, errors: [] });
  };
}
