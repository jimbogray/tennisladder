import { Router } from "express";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import * as players from "../controllers/players.controller.js";
import * as addresses from "../controllers/addresses.controller.js";

export const playersRouter = Router();

playersRouter.get("/", requireAuth, players.listLadder);
playersRouter.get("/challengeable", requireAuth, players.listChallengeable);
playersRouter.get("/me", requireAuth, players.me);
playersRouter.patch("/me", requireAuth, players.updateMe);
playersRouter.get("/me/addresses", requireAuth, addresses.listMyAddresses);
playersRouter.post("/me/addresses", requireAuth, addresses.createMyAddress);
playersRouter.delete("/me/addresses/:id", requireAuth, addresses.deleteMyAddress);

export const adminPlayersRouter = Router();
adminPlayersRouter.patch("/:id/points", requireAuth, requireAdmin, players.adjustPoints);
