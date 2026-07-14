import { Router } from "express";
import multer from "multer";
import { PhdImportController } from "./phd-import.controller";
import { PhdImportParser } from "./phd-import.parser";
import { PhdImportValidator } from "./phd-import.validator";
import { PhdImportRepository } from "./phd-import.repository";
import { PhdImportService } from "./phd-import.service";

const parser = new PhdImportParser();
const validator = new PhdImportValidator();
const repository = new PhdImportRepository();
const service = new PhdImportService(parser, validator, repository);
const controller = new PhdImportController(service);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const phdImportRouter = Router();

phdImportRouter.post(
  "/import",
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        controller.uploadError(error, req, res, next);
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ message: "Missing required file field", errors: [] });
        return;
      }

      if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
        res.status(400).json({ message: "Only .xlsx files are supported", errors: [] });
        return;
      }

      if (!file.buffer?.length) {
        res.status(400).json({ message: "File is empty", errors: [] });
        return;
      }

      next();
    });
  },
  controller.importCatalog
);
