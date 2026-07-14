import { Router } from "express";
import { db } from "../../core/db/drizzle/client";
import { SubSystemRepository } from "./sub-system.repository";
import { SubSystemService } from "./sub-system.service";
import { SubSystemController } from "./sub-system.controller";

// Dependency injection wiring
const repository  = new SubSystemRepository(db);
const service     = new SubSystemService(repository);
const controller  = new SubSystemController(service);

export const subSystemRouter = Router();

subSystemRouter.get("/",                             controller.getAll);
subSystemRouter.get("/by-nomenclature/:nomenclature", controller.getByNomenclature);
subSystemRouter.get("/:id",                          controller.getById);
subSystemRouter.patch("/relations/:id",              controller.updateRelationById);
subSystemRouter.delete("/relations/:id",             controller.deleteRelationById);
subSystemRouter.patch("/:id",                        controller.updateById);
subSystemRouter.delete("/:id",                       controller.deleteById);
subSystemRouter.post("/",                            controller.create);
subSystemRouter.post("/relations",                   controller.createRelation);
