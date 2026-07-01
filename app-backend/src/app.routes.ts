import { Router } from "express";
import { systemRouter }    from "./modules/system/system.routes";
import { subSystemRouter } from "./modules/sub-system/sub-system.routes";
import { tagRouter }       from "./modules/tag/tag.routes";
import { tagValueRouter }  from "./modules/tag-value/tag-value.routes";

export const appRouter = Router();

appRouter.get("/health", (_req, res) => {
  res.json({ ok: true, message: "Backend running" });
});

appRouter.use("/systems",     systemRouter);
appRouter.use("/sub-systems", subSystemRouter);
appRouter.use("/tags",        tagRouter);
appRouter.use("/tag-values",  tagValueRouter);