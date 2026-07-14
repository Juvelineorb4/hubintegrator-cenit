import { Router } from "express";
import { systemRouter }    from "./modules/system/system.routes";
import { subSystemRouter } from "./modules/sub-system/sub-system.routes";
import { tagRouter }       from "./modules/tag/tag.routes";
import { phdImportRouter } from "./modules/phd-import/phd-import.routes";
import { systemGroupRouter } from "./modules/system-group/system-group.routes";

export const appRouter = Router();

appRouter.get("/health", (_req, res) => {
  res.json({ ok: true, message: "Backend running" });
});

appRouter.use("/systems",     systemRouter);
appRouter.use("/sub-systems", subSystemRouter);
appRouter.use("/tags",        tagRouter);
appRouter.use("/system-groups", systemGroupRouter);
appRouter.use("/phd",         phdImportRouter);
