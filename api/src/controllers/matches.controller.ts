import type { Request, Response } from "express";
import { z } from "zod";
import { Prisma, MatchStatus } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import * as matchService from "../services/matchService.js";

// Joined onto matches so the UI can show player names. Deliberately narrow: selecting the whole
// User row would ship every player's email address to every other player.
const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  participatesInLadder: true,
  points: true,
  ustaRating: true,
} as const;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

/** Decimal doesn't survive res.json as a 1dp string on its own, so format it here. */
function toPublicUser(user: SelectedUser) {
  return { ...user, ustaRating: user.ustaRating?.toFixed(1) ?? null };
}

function withPublicPlayers<T extends { challenger: SelectedUser; opponent: SelectedUser }>(match: T) {
  return {
    ...match,
    challenger: toPublicUser(match.challenger),
    opponent: toPublicUser(match.opponent),
  };
}

export const listMatches = asyncHandler(async (req: Request, res: Response) => {
  const filter = (req.query.filter as string | undefined) ?? "all";
  const statusFilter: Prisma.MatchWhereInput =
    filter === "completed"
      ? { status: MatchStatus.COMPLETED }
      : filter === "pending"
        ? {
            status: {
              in: [
                MatchStatus.NEGOTIATING,
                MatchStatus.SCHEDULED,
                MatchStatus.RESULT_PENDING,
                MatchStatus.RESULT_DISPUTED,
              ],
            },
          }
        : {};

  const matches = await prisma.match.findMany({
    where: statusFilter,
    orderBy: { createdAt: "desc" },
    include: {
      challenger: { select: publicUserSelect },
      opponent: { select: publicUserSelect },
      proposedLocation: true,
    },
  });
  res.json(matches.map(withPublicPlayers));
});

export const myMatches = asyncHandler(async (req: Request, res: Response) => {
  const matches = await prisma.match.findMany({
    where: {
      status: "NEGOTIATING",
      OR: [{ challengerId: req.user!.id }, { opponentId: req.user!.id }],
    },
    orderBy: { lastActionAt: "desc" },
    include: {
      challenger: { select: publicUserSelect },
      opponent: { select: publicUserSelect },
    },
  });
  res.json(matches.map(withPublicPlayers));
});

export const getMatch = asyncHandler(async (req: Request, res: Response) => {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      challenger: { select: publicUserSelect },
      opponent: { select: publicUserSelect },
      proposedLocation: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  res.json(withPublicPlayers(match));
});

/**
 * A match can only be arranged for a slot that hasn't happened yet. Shared by the propose and
 * counter-propose schemas so both sides of a negotiation are held to the same rule.
 */
const futureDateTime = z
  .string()
  .datetime()
  .refine((value) => new Date(value).getTime() > Date.now(), {
    message: "Proposed date and time must be in the future",
  });

const proposeSchema = z.object({
  opponentId: z.string().min(1),
  proposedDateTime: futureDateTime,
  proposedLocationId: z.string().min(1),
  proposedComment: z.string().optional(),
});

export const proposeMatch = asyncHandler(async (req: Request, res: Response) => {
  const body = proposeSchema.parse(req.body);
  const match = await matchService.proposeMatch({
    challengerId: req.user!.id,
    opponentId: body.opponentId,
    proposedDateTime: new Date(body.proposedDateTime),
    proposedLocationId: body.proposedLocationId,
    proposedComment: body.proposedComment,
  });
  res.status(201).json(match);
});

// Amending your own standing offer and countering the other player's take the same input; only
// the turn handling differs, which the service enforces.
const proposalSchema = z.object({
  proposedDateTime: futureDateTime,
  proposedLocationId: z.string().min(1),
  proposedComment: z.string().optional(),
});

export const amendProposal = asyncHandler(async (req: Request, res: Response) => {
  const body = proposalSchema.parse(req.body);
  const match = await matchService.amendProposal(req.params.id, req.user!.id, {
    proposedDateTime: new Date(body.proposedDateTime),
    proposedLocationId: body.proposedLocationId,
    proposedComment: body.proposedComment,
  });
  res.json(match);
});

export const counterPropose = asyncHandler(async (req: Request, res: Response) => {
  const body = proposalSchema.parse(req.body);
  const match = await matchService.counterPropose(req.params.id, req.user!.id, {
    proposedDateTime: new Date(body.proposedDateTime),
    proposedLocationId: body.proposedLocationId,
    proposedComment: body.proposedComment,
  });
  res.json(match);
});

const cancelSchema = z.object({ comment: z.string().max(500).optional() });

export const cancelMatch = asyncHandler(async (req: Request, res: Response) => {
  const { comment } = cancelSchema.parse(req.body ?? {});
  const match = await matchService.cancelMatch(req.params.id, req.user!.id, comment?.trim() || undefined);
  res.json(match);
});

export const acceptMatch = asyncHandler(async (req: Request, res: Response) => {
  const match = await matchService.acceptMatch(req.params.id, req.user!.id);
  res.json(match);
});

export const declineMatch = asyncHandler(async (req: Request, res: Response) => {
  const match = await matchService.declineMatch(req.params.id, req.user!.id);
  res.json(match);
});

const resultSchema = z.object({ outcome: z.enum(["WON", "LOST"]) });

export const submitResult = asyncHandler(async (req: Request, res: Response) => {
  const { outcome } = resultSchema.parse(req.body);
  const match = await matchService.submitResult(req.params.id, req.user!.id, outcome);
  res.json(match);
});

export const adminPendingMatches = asyncHandler(async (_req: Request, res: Response) => {
  const matches = await prisma.match.findMany({
    where: { status: "NEGOTIATING" },
    orderBy: { lastActionAt: "desc" },
    include: {
      challenger: { select: publicUserSelect },
      opponent: { select: publicUserSelect },
    },
  });
  res.json(matches.map(withPublicPlayers));
});

const overrideSchema = z.object({ winnerId: z.string().min(1), loserId: z.string().min(1) });

export const adminOverrideResult = asyncHandler(async (req: Request, res: Response) => {
  const { winnerId, loserId } = overrideSchema.parse(req.body);
  const match = await matchService.adminOverrideResult(req.params.id, req.user!.id, winnerId, loserId);
  res.json(match);
});
