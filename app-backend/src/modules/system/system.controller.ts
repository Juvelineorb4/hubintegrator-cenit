import { Request, Response } from "express";
import { SystemService } from "./system.service";

export class SystemController {
  constructor(private service: SystemService) {}

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
        res.status(404).json({ success: false, message: "System not found" });
        return;
      }
      res.json({ success: true, data: rows[0] });
    } catch {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  getByName = async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await this.service.getByName(req.params.name as string);
      if (!rows.length) {
        res.status(404).json({ success: false, message: "System not found" });
        return;
      }
      res.json({ success: true, data: rows[0] });
    } catch {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await this.service.create(req.body);
      res.status(201).json({ success: true, data: rows[0] });
    } catch {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
}
