import type { Request, Response } from "express";
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

export const submitResultViaToken = asyncHandler(async (req: Request, res: Response) => {
  const resultToken = await prisma.matchResultToken.findUnique({
    where: { token: hashToken(req.params.token) },
  });
  if (!resultToken || resultToken.usedAt) {
    res.status(404).json({ error: "Invalid or already-used link" });
    return;
  }

  // TODO: when result tokens are actually generated (see acceptMatch), handle the second player's
  // link too — an outcome matching the reported score should confirm it, a conflicting one reject
  // it. Today only the first report can arrive this way, so it maps to proposing a score.
  const match = await matchService.proposeResult(
    resultToken.matchId,
    resultToken.userId,
    resultToken.outcome,
  );
  await prisma.matchResultToken.update({
    where: { id: resultToken.id },
    data: { usedAt: new Date() },
  });
  res.json(match);
});
