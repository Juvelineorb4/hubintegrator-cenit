import { Router } from "express";
import { db } from "../../core/db/drizzle/client";
import { SystemRepository } from "./system.repository";
import { SystemService } from "./system.service";
import { SystemController } from "./system.controller";

// Dependency injection wiring
const repository  = new SystemRepository(db);
const service     = new SystemService(repository);
const controller  = new SystemController(service);

export const systemRouter = Router();

systemRouter.get("/",              controller.getAll);
systemRouter.get("/by-name/:name", controller.getByName);
systemRouter.get("/:id",           controller.getById);
systemRouter.patch("/:id",         controller.updateById);
systemRouter.delete("/:id",        controller.deleteById);
systemRouter.post("/",             controller.create);
