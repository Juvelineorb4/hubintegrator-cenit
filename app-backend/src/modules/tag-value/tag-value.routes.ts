import { Router } from "express";
import { db } from "../../core/db/drizzle/client";
import { TagValueRepository } from "./tag-value.repository";
import { TagValueService }    from "./tag-value.service";
import { TagValueController } from "./tag-value.controller";

const repository = new TagValueRepository(db);
const service    = new TagValueService(repository);
const controller = new TagValueController(service);

export const tagValueRouter = Router();

tagValueRouter.get("/raw",              controller.getRaw);
tagValueRouter.post("/raw/batch",       controller.getRawBatch);
tagValueRouter.post("/batch/historized", controller.getHistorizedBatch);