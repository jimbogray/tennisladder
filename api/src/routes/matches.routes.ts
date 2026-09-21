import { Router } from "express";
import { requireAdmin, requireAuth, requireLadderParticipant } from "../auth/middleware.js";
import * as matches from "../controllers/matches.controller.js";

export const matchesRouter = Router();

matchesRouter.get("/", requireAuth, matches.listMatches);
matchesRouter.get("/mine", requireAuth, matches.myMatches);
matchesRouter.get("/:id", requireAuth, matches.getMatch);
// The caller's own journey to the match — see the travel-origin route below.
matchesRouter.get("/:id/travel-plan", requireAuth, matches.getTravelPlan);

// Proposing/responding to challenges requires ladder participation — coach-admins are
// excluded even though they otherwise have full admin rights (see participatesInLadder on User).
matchesRouter.post("/", requireAuth, requireLadderParticipant, matches.proposeMatch);
matchesRouter.post("/:id/amend", requireAuth, requireLadderParticipant, matches.amendProposal);
matchesRouter.post("/:id/counter", requireAuth, requireLadderParticipant, matches.counterPropose);
matchesRouter.post("/:id/accept", requireAuth, requireLadderParticipant, matches.acceptMatch);
matchesRouter.post("/:id/decline", requireAuth, requireLadderParticipant, matches.declineMatch);
matchesRouter.post("/:id/withdraw", requireAuth, requireLadderParticipant, matches.withdrawMatch);
matchesRouter.post("/:id/cancel", requireAuth, requireLadderParticipant, matches.cancelMatch);
// Private to the caller, so it isn't a negotiation step and needs no turn — just being a player.
matchesRouter.put("/:id/travel-origin", requireAuth, matches.setTravelOrigin);
matchesRouter.post("/:id/result", requireAuth, requireLadderParticipant, matches.proposeResult);
matchesRouter.post("/:id/result/amend", requireAuth, requireLadderParticipant, matches.amendResult);
matchesRouter.post("/:id/result/confirm", requireAuth, requireLadderParticipant, matches.confirmResult);
matchesRouter.post("/:id/result/reject", requireAuth, requireLadderParticipant, matches.rejectResult);

export const adminMatchesRouter = Router();
adminMatchesRouter.get("/pending", requireAuth, requireAdmin, matches.adminPendingMatches);
adminMatchesRouter.post("/:id/cancel", requireAuth, requireAdmin, matches.adminCancelMatch);
adminMatchesRouter.post("/:id/override-result", requireAuth, requireAdmin, matches.adminOverrideResult);
