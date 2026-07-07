import { Router } from "express";
import { requireAdmin, requireAuth, requireLadderParticipant } from "../auth/middleware.js";
import * as matches from "../controllers/matches.controller.js";

export const matchesRouter = Router();

matchesRouter.get("/", requireAuth, matches.listMatches);
matchesRouter.get("/mine", requireAuth, matches.myMatches);
matchesRouter.get("/:id", requireAuth, matches.getMatch);

// Proposing/responding to challenges requires ladder participation — coach-admins are
// excluded even though they otherwise have full admin rights (see participatesInLadder on User).
matchesRouter.post("/", requireAuth, requireLadderParticipant, matches.proposeMatch);
matchesRouter.post("/:id/counter", requireAuth, requireLadderParticipant, matches.counterPropose);
matchesRouter.post("/:id/accept", requireAuth, requireLadderParticipant, matches.acceptMatch);
matchesRouter.post("/:id/decline", requireAuth, requireLadderParticipant, matches.declineMatch);
matchesRouter.post("/:id/result", requireAuth, requireLadderParticipant, matches.submitResult);

export const adminMatchesRouter = Router();
adminMatchesRouter.get("/pending", requireAuth, requireAdmin, matches.adminPendingMatches);
adminMatchesRouter.post("/:id/override-result", requireAuth, requireAdmin, matches.adminOverrideResult);
