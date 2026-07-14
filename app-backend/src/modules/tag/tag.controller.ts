import { Request, Response } from "express";
import { TagService } from "./tag.service";
import { toSafeHttpError } from "../../shared/errors/http-error";

export class TagController {
  constructor(private service: TagService) { }

  getAll = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.service.getAll();
      res.json({ success: true, data, total: data.length });
    } catch {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await this.service.getById(req.params.id as string);
      if (!rows.length) {
        res.status(404).json({ success: false, message: "Tag not found" });
        return;
      }
      res.json({ success: true, data: rows[0] });
    } catch {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  getPressureBySystemCode = async (req: Request, res: Response): Promise<void> => {
    try {
      const { systemCode } = req.query;
      if (!systemCode || typeof systemCode !== "string") {
        res.status(400).json({ success: false, message: "'systemCode' query param is required" });
        return;
      }
      const data = await this.service.getPressureBySystemCode(systemCode);
      res.json({ success: true, data, total: data.length });
    } catch {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
  getFlowBySystemCode = async (req: Request, res: Response): Promise<void> => {
    try {
      const { systemCode } = req.query;
      if (!systemCode || typeof systemCode !== "string") {
        res.status(400).json({ success: false, message: "'systemCode' query param is required" });
        return;
      }
      const data = await this.service.getFlowBySystemCode(systemCode);
      res.json({ success: true, data, total: data.length });
    } catch {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
  getVolumeBySystemCode = async (req: Request, res: Response): Promise<void> => {
    try {
      const { systemCode } = req.query;
      if (!systemCode || typeof systemCode !== "string") {
        res.status(400).json({ success: false, message: "'systemCode' query param is required" });
        return;
      }
      const data = await this.service.getVolumeBySystemCode(systemCode);
      res.json({ success: true, data, total: data.length });
    } catch {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = { ...req.body };
      if (body.historizationFrom && typeof body.historizationFrom === "string") {
        body.historizationFrom = new Date(body.historizationFrom);
      }
      const rows = await this.service.create(body);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
      const httpError = toSafeHttpError(error);
      const message = httpError.expose ? httpError.message : "Internal server error";
      res.status(httpError.statusCode).json({ success: false, message });
    }
  };

  updateById = async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await this.service.updateById(req.params.id as string, req.body);
      res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
      const httpError = toSafeHttpError(error);
      const message = httpError.expose ? httpError.message : "Internal server error";
      res.status(httpError.statusCode).json({ success: false, message });
    }
  };

  deleteById = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.service.deleteById(req.params.id as string);
      res.status(204).send();
    } catch (error) {
      const httpError = toSafeHttpError(error);
      const message = httpError.expose ? httpError.message : "Internal server error";
      res.status(httpError.statusCode).json({ success: false, message });
    }
  };
}