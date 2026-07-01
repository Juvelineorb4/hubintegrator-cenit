import { Request, Response } from "express";
import { TagValueService } from "./tag-value.service";

export class TagValueController {
  constructor(private service: TagValueService) {}

  getRaw = async (req: Request, res: Response): Promise<void> => {
    const { tagname, start, end } = req.query;

    if (!tagname || !start || !end) {
      res.status(400).json({
        success: false,
        message: "Los parámetros 'tagname', 'start' y 'end' son requeridos",
      });
      return;
    }
   
    const startDate = new Date(start as string);
    const endDate   = new Date(end   as string);
  
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({
        success: false,
        message: "'start' y 'end' deben ser fechas ISO 8601 válidas",
      });
      return;
    }

    try {
      const data = await this.service.getRaw(tagname as string, startDate, endDate);
      res.json({ success: true, data, total: data.length });
    } catch (err) {
      console.error("[tag-value] getRaw error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  getRawBatch = async (req: Request, res: Response): Promise<void> => {
    const { tagnames, start, end, limit, offset } = req.body as Record<string, unknown>;

    if (!Array.isArray(tagnames) || tagnames.length === 0) {
      res.status(400).json({
        success: false,
        message: "'tagnames' debe ser un arreglo no vacío de strings",
      });
      return;
    }

    if (!start || !end) {
      res.status(400).json({
        success: false,
        message: "Los parámetros 'start' y 'end' son requeridos",
      });
      return;
    }

    const startDate = new Date(start as string);
    const endDate   = new Date(end   as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({
        success: false,
        message: "'start' y 'end' deben ser fechas ISO 8601 válidas",
      });
      return;
    }

    const MAX_LIMIT = 1_000_000;
    const parsedLimit  = Math.min(Number(limit  ?? 1_000_000), MAX_LIMIT);
    const parsedOffset = Math.max(Number(offset ?? 0), 0);

    if (!Number.isFinite(parsedLimit) || !Number.isFinite(parsedOffset)) {
      res.status(400).json({ success: false, message: "'limit' y 'offset' deben ser números enteros" });
      return;
    }

    try {
      const data = await this.service.getRawBatch(
        tagnames as string[],
        startDate,
        endDate,
        parsedLimit,
        parsedOffset,
      );

      const hasMore = data.length === parsedLimit;

      res.json({
        success: true,
        data,
        total: data.length,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore,
      });
    } catch (err) {
      console.error("[tag-value] getRawBatch error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  getHistorizedBatch = async (req: Request, res: Response): Promise<void> => {
    const { tagnames, start, end, intervalSeconds } = req.body as Record<string, unknown>;

    if (!Array.isArray(tagnames) || tagnames.length === 0) {
      res.status(400).json({
        success: false,
        message: "'tagnames' must be a non-empty array of strings",
      });
      return;
    }

    if (!start || !end) {
      res.status(400).json({
        success: false,
        message: "'start' and 'end' are required",
      });
      return;
    }

    const startDate = new Date(start as string);
    const endDate   = new Date(end   as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({
        success: false,
        message: "'start' and 'end' must be valid ISO 8601 dates",
      });
      return;
    }

    if (startDate > endDate) {
      res.status(400).json({
        success: false,
        message: "'start' must be <= 'end'",
      });
      return;
    }

    const parsedInterval = Number(intervalSeconds ?? 0);
    if (!Number.isFinite(parsedInterval) || parsedInterval <= 0) {
      res.status(400).json({
        success: false,
        message: "'intervalSeconds' must be a positive integer",
      });
      return;
    }

    try {
      const data = await this.service.getHistorizedBatch(
        tagnames as string[],
        startDate,
        endDate,
        parsedInterval,
      );
      res.json({ success: true, data, total: data.length });
    } catch (err) {
      console.error("[tag-value] getHistorizedBatch error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
}