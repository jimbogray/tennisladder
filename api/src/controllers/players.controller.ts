import type { Request, Response } from "express";
import { z } from "zod";
import { AVATAR_IDS, USTA_RATINGS, toAvatarId } from "@tennisladder/shared";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { toSessionUserDto } from "../auth/sessionUser.js";
import { exportPersonalData } from "../services/playerDataService.js";

/**
 * A copy of everything the app holds about the signed-in player, downloaded from their profile.
 *
 * Pretty-printed, because the person opening it is the subject rather than a program. The
 * attachment header is for anyone calling the API directly with a token; the SPA has to fetch this
 * with its bearer token and save the body itself, so it names the file on its own side.
 */
export const exportMyData = asyncHandler(async (req: Request, res: Response) => {
  const data = await exportPersonalData(req.user!.id);
  // The token verified against a user row, so this can only be a row deleted mid-request.
  if (!data) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const stamp = data.exportedAt.slice(0, 10);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="tennis-ladder-data-${stamp}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

export const listLadder = asyncHandler(async (_req: Request, res: Response) => {
  const players = await prisma.user.findMany({
    // profileCompletedAt: a Google signup that hasn't redeemed an invite code isn't on the team.
    where: { participatesInLadder: true, removedAt: null, profileCompletedAt: { not: null } },
    orderBy: { points: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      points: true,
      ustaRating: true,
      avatarId: true,
    },
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
      avatarId: toAvatarId(player.avatarId),
      points: player.points,
      wins: winsByUserId.get(player.id) ?? 0,
      losses: lossesByUserId.get(player.id) ?? 0,
      ties: tiesByUserId.get(player.id) ?? 0,
    })),
  );
});

export const listChallengeable = asyncHandler(async (req: Request, res: Response) => {
  const players = await prisma.user.findMany({
    where: {
      participatesInLadder: true,
      removedAt: null,
      profileCompletedAt: { not: null },
      id: { not: req.user?.id },
    },
    orderBy: { firstName: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      points: true,
      role: true,
      participatesInLadder: true,
      ustaRating: true,
      avatarId: true,
    },
  });
  res.json(
    players.map((p) => ({
      ...p,
      ustaRating: p.ustaRating?.toFixed(1) ?? null,
      avatarId: toAvatarId(p.avatarId),
    })),
  );
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
  // An empty <select> means "no rating"; anything off the NTRP scale is rejected here rather than
  // handed to a Decimal(2,1) column that would throw on it.
  ustaRating: z
    .union([z.enum(USTA_RATINGS), z.literal(""), z.null()], {
      errorMap: () => ({ message: "Choose a USTA rating from the list" }),
    })
    .optional(),
  // An empty string is the "back to my initials" option, the same shape the rating field uses.
  avatarId: z
    .union([z.enum(AVATAR_IDS), z.literal(""), z.null()], {
      errorMap: () => ({ message: "Choose one of the available avatars" }),
    })
    .optional(),
});

/**
 * Name, USTA rating and avatar are the self-editable fields; email and role changes need a
 * different flow.
 * Points aren't touchable here either — they're earned, or adjusted by an admin.
 */
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const { firstName, lastName, ustaRating, avatarId } = updateProfileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      firstName,
      lastName,
      // A rating only means something for someone on the ladder — the same rule registration
      // applies. Coach-admins never get one, whatever they send.
      ...(ustaRating !== undefined && req.user!.participatesInLadder
        ? { ustaRating: ustaRating === "" ? null : ustaRating }
        : {}),
      // Unlike a rating, a portrait isn't a ladder concept, so coach-admins get one too.
      ...(avatarId !== undefined ? { avatarId: avatarId === "" ? null : avatarId } : {}),
    },
  });
  res.json(toSessionUserDto(user));
});

export const adjustPoints = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: PointsAdjustment audit row + User.points update, admin-only (see routes).
  res.status(501).json({ error: "Not implemented" });
});
