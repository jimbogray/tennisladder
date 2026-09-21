import type { Request, Response } from "express";
import { MatchStatus, ResultOutcome } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { hashToken } from "../services/tokenService.js";
import * as matchService from "../services/matchService.js";

export const resolveResultToken = asyncHandler(async (req: Request, res: Response) => {
  const resultToken = await prisma.matchResultToken.findUnique({
    where: { token: hashToken(req.params.token) },
    include: { match: true },
  });
  if (!resultToken || resultToken.usedAt) {
    res.status(404).json({ error: "Invalid or already-used link" });
    return;
  }
  res.json({ matchId: resultToken.matchId, outcome: resultToken.outcome });
});

/**
 * Whether a player's "I won"/"I lost" click agrees with the score the other player already
 * reported. The stored result is absolute (a winner and a loser), so it has to be read back from
 * this player's point of view before the two can be compared.
 */
function agreesWithReportedResult(
  match: { isTie: boolean; winnerId: string | null; loserId: string | null },
  userId: string,
  outcome: ResultOutcome,
): boolean {
  // A reported tie agrees with neither "I won" nor "I lost" — there's no tie link to click.
  if (match.isTie) return false;
  return outcome === ResultOutcome.WON ? match.winnerId === userId : match.loserId === userId;
}

export const submitResultViaToken = asyncHandler(async (req: Request, res: Response) => {
  const resultToken = await prisma.matchResultToken.findUnique({
    where: { token: hashToken(req.params.token) },
    include: { match: true },
  });
  if (!resultToken || resultToken.usedAt) {
    res.status(404).json({ error: "Invalid or already-used link" });
    return;
  }

  const { match, userId, outcome } = resultToken;
  let updated;

  if (match.status === MatchStatus.SCHEDULED) {
    // Nobody has reported yet, so this click is the first word on the match.
    updated = await matchService.proposeResult(match.id, userId, outcome);
  } else if (
    match.status === MatchStatus.RESULT_PENDING &&
    match.resultReportedByUserId !== userId
  ) {
    // The other player reported first. This link either agrees with them, which settles the match
    // and moves the ladder, or contradicts them, which sends it to an admin to resolve.
    updated = agreesWithReportedResult(match, userId, outcome)
      ? await matchService.confirmResult(match.id, userId)
      : await matchService.rejectResult(
          match.id,
          userId,
          "Disagreed with the reported score from an emailed result link.",
        );
  } else {
    // Already reported by this player, cancelled, disputed, or long since completed.
    res.status(409).json({ error: "This match is no longer waiting on your result" });
    return;
  }

  // One click is a player's whole say on the match, so their other link goes with the one they
  // used — otherwise an "I lost" link could walk back the "I won" they just sent.
  await prisma.matchResultToken.updateMany({
    where: { matchId: match.id, userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  res.json(updated);
});
