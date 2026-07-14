import { Router } from "express";
import { db } from "../../core/db/drizzle/client";
import { SystemGroupController } from "./system-group.controller";
import { SystemGroupRepository } from "./system-group.repository";
import { SystemGroupService } from "./system-group.service";

const repository = new SystemGroupRepository(db);
const service = new SystemGroupService(repository);
const controller = new SystemGroupController(service);

export const systemGroupRouter = Router();

systemGroupRouter.get("/", controller.getAll);
systemGroupRouter.get("/:id", controller.getById);
systemGroupRouter.get("/:id/members", controller.getMembers);
systemGroupRouter.post("/", controller.create);
systemGroupRouter.post("/:id/members", controller.createMember);
systemGroupRouter.patch("/:id", controller.updateById);
systemGroupRouter.patch("/:groupId/members/:memberId", controller.updateMemberById);
systemGroupRouter.delete("/:groupId/members/:memberId", controller.deleteMemberById);
systemGroupRouter.delete("/:id", controller.deleteById);
