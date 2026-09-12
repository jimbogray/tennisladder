import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";

export const listLadder = asyncHandler(async (_req: Request, res: Response) => {
  const players = await prisma.user.findMany({
    where: { participatesInLadder: true },
    orderBy: { points: "desc" },
    select: { id: true, firstName: true, lastName: true, points: true, ustaRating: true },
  });

  const [wins, losses] = await Promise.all([
    prisma.match.groupBy({
      by: ["winnerId"],
      where: { status: "COMPLETED" },
      _count: { _all: true },
    }),
    prisma.match.groupBy({
      by: ["loserId"],
      where: { status: "COMPLETED" },
      _count: { _all: true },
    }),
  ]);
  const winsByUserId = new Map(wins.map((w) => [w.winnerId, w._count._all]));
  const lossesByUserId = new Map(losses.map((l) => [l.loserId, l._count._all]));

  res.json(
    players.map((player) => ({
      userId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      // toFixed(1), not toString(): NTRP ratings are always written to one decimal place, and
      // Decimal.toString() would render a stored 3.0 as "3" next to its "2.5"/"3.5" neighbours.
      ustaRating: player.ustaRating?.toFixed(1) ?? null,
      points: player.points,
      wins: winsByUserId.get(player.id) ?? 0,
      losses: lossesByUserId.get(player.id) ?? 0,
    })),
  );
});

export const listChallengeable = asyncHandler(async (req: Request, res: Response) => {
  const players = await prisma.user.findMany({
    where: { participatesInLadder: true, id: { not: req.user?.id } },
    orderBy: { firstName: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      points: true,
      role: true,
      participatesInLadder: true,
      ustaRating: true,
    },
  });
  res.json(players.map((p) => ({ ...p, ustaRating: p.ustaRating?.toFixed(1) ?? null })));
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json(user);
});

export const adjustPoints = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: PointsAdjustment audit row + User.points update, admin-only (see routes).
  res.status(501).json({ error: "Not implemented" });
});
