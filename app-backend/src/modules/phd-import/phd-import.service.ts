import { db, DrizzleDB } from "../../core/db/drizzle/client";
import { HttpError } from "../../shared/errors/http-error";
import { ImportSummary, ImportValidationError } from "./phd-import.types";
import { PhdImportParser } from "./phd-import.parser";
import { PhdImportValidator } from "./phd-import.validator";
import { PhdImportRepository } from "./phd-import.repository";

export class PhdImportService {
  constructor(
    private parser: PhdImportParser,
    private validator: PhdImportValidator,
    private repository: PhdImportRepository
  ) {}

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

    return db.transaction(async (tx) => {
      try {
        return await this.repository.importCatalog(tx as unknown as DrizzleDB, normalized, dryRun);
      } catch (error) {
        if (error instanceof ImportValidationError || error instanceof HttpError) {
          throw error;
        }
        throw new HttpError(500, "Internal server error", false);
      }
    });
  }
}
