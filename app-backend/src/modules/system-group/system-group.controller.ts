import { Request, Response } from "express";
import { toSafeHttpError } from "../../shared/errors/http-error";
import { SystemGroupService } from "./system-group.service";

export class SystemGroupController {
  constructor(private service: SystemGroupService) {}

  getAll = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.service.getAll();
      res.status(200).json({ success: true, data, total: data.length });
    } catch {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.service.getById(req.params.id as string);
      res.status(200).json({ success: true, data });
    } catch (error) {
      const httpError = toSafeHttpError(error);
      const message = httpError.expose ? httpError.message : "Internal server error";
      res.status(httpError.statusCode).json({ success: false, message });
    }
  };

  getMembers = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.service.getMembers(req.params.id as string);
      res.status(200).json({ success: true, data, total: data.length });
    } catch (error) {
      const httpError = toSafeHttpError(error);
      const message = httpError.expose ? httpError.message : "Internal server error";
      res.status(httpError.statusCode).json({ success: false, message });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await this.service.create(req.body);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
      const httpError = toSafeHttpError(error);
      const message = httpError.expose ? httpError.message : "Internal server error";
      res.status(httpError.statusCode).json({ success: false, message });
    }
  };

  createMember = async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await this.service.createMember(req.params.id as string, req.body);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
      const httpError = toSafeHttpError(error);
      const message = httpError.expose ? httpError.message : "Internal server error";
      res.status(httpError.statusCode).json({ success: false, message });
    }
  };
}
