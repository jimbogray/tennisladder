import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { streamLiveUpdates } from "../controllers/live.controller.js";

export const liveRouter = Router();

liveRouter.get("/", requireAuth, streamLiveUpdates);
