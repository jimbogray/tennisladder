import type { Request, Response } from "express";
import { z } from "zod";
import { Prisma, MatchStatus } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import * as matchService from "../services/matchService.js";

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
    include: { challenger: true, opponent: true, proposedLocation: true },
  });
  res.json(matches);
});

export const myMatches = asyncHandler(async (req: Request, res: Response) => {
  const matches = await prisma.match.findMany({
    where: {
      status: "NEGOTIATING",
      OR: [{ challengerId: req.user!.id }, { opponentId: req.user!.id }],
    },
    orderBy: { lastActionAt: "desc" },
  });
  res.json(matches);
});

export const getMatch = asyncHandler(async (req: Request, res: Response) => {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  res.json(match);
});

const proposeSchema = z.object({
  opponentId: z.string().min(1),
  proposedDateTime: z.string().datetime(),
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

const counterSchema = z.object({
  proposedDateTime: z.string().datetime(),
  proposedLocationId: z.string().min(1),
  proposedComment: z.string().optional(),
});

export const counterPropose = asyncHandler(async (req: Request, res: Response) => {
  const body = counterSchema.parse(req.body);
  const match = await matchService.counterPropose(req.params.id, req.user!.id, {
    proposedDateTime: new Date(body.proposedDateTime),
    proposedLocationId: body.proposedLocationId,
    proposedComment: body.proposedComment,
  });
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
    include: { challenger: true, opponent: true },
  });
  res.json(matches);
});

const overrideSchema = z.object({ winnerId: z.string().min(1), loserId: z.string().min(1) });

export const adminOverrideResult = asyncHandler(async (req: Request, res: Response) => {
  const { winnerId, loserId } = overrideSchema.parse(req.body);
  const match = await matchService.adminOverrideResult(req.params.id, req.user!.id, winnerId, loserId);
  res.json(match);
});
