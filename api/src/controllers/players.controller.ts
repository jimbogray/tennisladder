import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { toSessionUserDto } from "../auth/sessionUser.js";

export const listLadder = asyncHandler(async (_req: Request, res: Response) => {
  const players = await prisma.user.findMany({
    where: { participatesInLadder: true },
    orderBy: { points: "desc" },
    select: { id: true, firstName: true, lastName: true, points: true, ustaRating: true },
  });

  // Ties have no winnerId/loserId, so they're counted off the challenger/opponent columns and
  // summed — a player can have tied as either side.
  const [wins, losses, tiesAsChallenger, tiesAsOpponent] = await Promise.all([
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
    prisma.match.groupBy({
      by: ["challengerId"],
      where: { status: "COMPLETED", isTie: true },
      _count: { _all: true },
    }),
    prisma.match.groupBy({
      by: ["opponentId"],
      where: { status: "COMPLETED", isTie: true },
      _count: { _all: true },
    }),
  ]);
  const winsByUserId = new Map(wins.map((w) => [w.winnerId, w._count._all]));
  const lossesByUserId = new Map(losses.map((l) => [l.loserId, l._count._all]));
  const tiesByUserId = new Map<string, number>();
  for (const row of tiesAsChallenger) {
    tiesByUserId.set(row.challengerId, (tiesByUserId.get(row.challengerId) ?? 0) + row._count._all);
  }
  for (const row of tiesAsOpponent) {
    tiesByUserId.set(row.opponentId, (tiesByUserId.get(row.opponentId) ?? 0) + row._count._all);
  }

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
      ties: tiesByUserId.get(player.id) ?? 0,
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
  res.json(toSessionUserDto(user));
});

const nameField = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(100, `${label} must be 100 characters or fewer`);

const updateProfileSchema = z.object({
  firstName: nameField("First name"),
  lastName: nameField("Last name"),
});

/** Name is the only self-editable field; email and role changes need a different flow. */
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const { firstName, lastName } = updateProfileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { firstName, lastName },
  });
  res.json(toSessionUserDto(user));
});

export const adjustPoints = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: PointsAdjustment audit row + User.points update, admin-only (see routes).
  res.status(501).json({ error: "Not implemented" });
});
