import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";

export const listLadder = asyncHandler(async (_req: Request, res: Response) => {
  const players = await prisma.user.findMany({
    where: { participatesInLadder: true },
    orderBy: { points: "desc" },
    select: { id: true, firstName: true, lastName: true, points: true },
  });
  res.json(players);
});

export const listChallengeable = asyncHandler(async (req: Request, res: Response) => {
  const players = await prisma.user.findMany({
    where: { participatesInLadder: true, id: { not: req.user?.id } },
    orderBy: { firstName: "asc" },
    select: { id: true, firstName: true, lastName: true, points: true },
  });
  res.json(players);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json(user);
});

export const adjustPoints = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: PointsAdjustment audit row + User.points update, admin-only (see routes).
  res.status(501).json({ error: "Not implemented" });
});
