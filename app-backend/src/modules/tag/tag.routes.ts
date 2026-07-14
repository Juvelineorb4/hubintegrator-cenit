import { Router } from "express";
import { db } from "../../core/db/drizzle/client";
import { TagRepository } from "./tag.repository";
import { TagService } from "./tag.service";
import { TagController } from "./tag.controller";

// Dependency injection wiring
const repository = new TagRepository(db);
const service = new TagService(repository);
const controller = new TagController(service);

export const tagRouter = Router();
tagRouter.get("/volume", controller.getVolumeBySystemCode);
tagRouter.get("/pressure", controller.getPressureBySystemCode);
tagRouter.get("/flow", controller.getFlowBySystemCode);
tagRouter.patch("/:id", controller.updateById);
tagRouter.get("/", controller.getAll);
tagRouter.get("/:id", controller.getById);
tagRouter.post("/", controller.create);