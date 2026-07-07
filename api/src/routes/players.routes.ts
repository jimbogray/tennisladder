import { Router } from "express";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import * as players from "../controllers/players.controller.js";

export const playersRouter = Router();

playersRouter.get("/", requireAuth, players.listLadder);
playersRouter.get("/challengeable", requireAuth, players.listChallengeable);
playersRouter.get("/me", requireAuth, players.me);

export const adminPlayersRouter = Router();
adminPlayersRouter.patch("/:id/points", requireAuth, requireAdmin, players.adjustPoints);
