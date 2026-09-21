import type { Request, Response } from "express";
import { z } from "zod";
import { AccountType, MatchStatus, type UserRole } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import {
  accountFieldsFor,
  accountTypeFor,
  generateRegistrationCode,
} from "../services/registrationCodeService.js";
import { sendEmail } from "../services/emailService.js";
import { ErasureBlockedError, erasePersonalData } from "../services/playerDataService.js";
import { renderInviteEmail } from "../emails/templates/invite.js";
import { env } from "../config/env.js";

// Defaults to PLAYER so a client that doesn't send a type can never hand out admin rights.
const accountTypeSchema = z.nativeEnum(AccountType).default(AccountType.PLAYER);

const createCodeSchema = z.object({
  intendedForNote: z.string().optional(),
  accountType: accountTypeSchema,
});

export const createRegistrationCode = asyncHandler(async (req: Request, res: Response) => {
  const { intendedForNote, accountType } = createCodeSchema.parse(req.body ?? {});
  const code = await generateRegistrationCode(req.user!.id, { accountType, intendedForNote });
  res.status(201).json(code);
});

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  accountType: accountTypeSchema,
});

/**
 * Issues a registration code and emails it as a one-click invite link. The code is created first
 * and kept even if the send fails, so an admin can fall back to reading the code out manually.
 */
export const inviteByEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email, accountType } = inviteSchema.parse(req.body);
  const invitedEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email: invitedEmail } });
  if (existingUser) {
    res.status(409).json({ error: "That email address already has an account" });
    return;
  }

  const code = await generateRegistrationCode(req.user!.id, { accountType, invitedEmail });

  const registerUrl = `${env.webAppUrl}/register?code=${encodeURIComponent(code.code)}`;
  const { subject, html } = renderInviteEmail({
    registerUrl,
    code: code.code,
    expiresAt: code.expiresAt,
  });
  await sendEmail({ to: invitedEmail, subject, html });

  res.status(201).json({ ...code, isActive: true });
});

export const listRegistrationCodes = asyncHandler(async (_req: Request, res: Response) => {
  const codes = await prisma.registrationCode.findMany({
    orderBy: { createdAt: "desc" },
  });
  // `expired` is computed at read time (expiresAt < now), not tracked via a background sweep.
  const now = new Date();
  res.json(
    codes.map((c) => ({
      ...c,
      isActive: !c.usedAt && c.expiresAt > now,
    })),
  );
});

export const expireRegistrationCode = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  // Only active (unused, not-yet-expired) codes can be manually expired; expiring is done by
  // pulling expiresAt back to now. A used code is a no-op target and returns 409.
  const { count } = await prisma.registrationCode.updateMany({
    where: { id: req.params.id, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });

  if (count === 0) {
    res.status(409).json({ message: "Code is not active and cannot be expired." });
    return;
  }

  const code = await prisma.registrationCode.findUnique({ where: { id: req.params.id } });
  res.json({ ...code, isActive: false });
});

const teamMemberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  participatesInLadder: true,
  removedAt: true,
} as const;

function toTeamMemberDto(user: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  participatesInLadder: boolean;
  removedAt: Date | null;
}) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    accountType: accountTypeFor(user),
    removedAt: user.removedAt?.toISOString() ?? null,
  };
}

/**
 * The team, including people already removed from it.
 *
 * Removed members are listed because erasing their data is an admin action and this is the only
 * page it can be offered from — leaving them out would make a removal one-way into a row nobody
 * can ever clear. Someone whose data has been erased is left out: what remains of that row is a
 * placeholder holding old matches together, not a person an admin can do anything with or to.
 */
export const listTeamMembers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    // A Google signup that hasn't redeemed an invite code has an account but isn't on the team.
    where: { profileCompletedAt: { not: null }, personalDataErasedAt: null },
    // nulls first: current members before removed ones, which Postgres would otherwise reverse.
    orderBy: [
      { removedAt: { sort: "asc", nulls: "first" } },
      { firstName: "asc" },
      { lastName: "asc" },
    ],
    select: teamMemberSelect,
  });
  res.json(users.map(toTeamMemberDto));
});

// Matches that still need both players; taking someone off the ladder would strand these.
const OPEN_MATCH_STATUSES = [
  MatchStatus.NEGOTIATING,
  MatchStatus.SCHEDULED,
  MatchStatus.RESULT_PENDING,
  MatchStatus.RESULT_DISPUTED,
];

function countOpenMatches(userId: string) {
  return prisma.match.count({
    where: {
      status: { in: OPEN_MATCH_STATUSES },
      OR: [{ challengerId: userId }, { opponentId: userId }],
    },
  });
}

function unfinishedMatchesMessage(firstName: string, openMatches: number, action: string) {
  return `${firstName} has ${openMatches} unfinished ${openMatches === 1 ? "match" : "matches"}. Finish or cancel ${openMatches === 1 ? "it" : "them"} before ${action}.`;
}

const updateAccountTypeSchema = z.object({
  accountType: z.nativeEnum(AccountType),
});

/**
 * Changes a user's account type by rewriting role and participatesInLadder, the same mapping an
 * invite applies on redemption. Points and USTA rating are kept, so moving someone off the ladder
 * and back again loses nothing. The new role takes effect on the user's next token refresh.
 */
export const updateTeamMemberAccountType = asyncHandler(async (req: Request, res: Response) => {
  const { accountType } = updateAccountTypeSchema.parse(req.body);
  const { role, participatesInLadder } = accountFieldsFor(accountType);

  const user = await prisma.user.findUnique({
    where: { id: req.params.id, removedAt: null },
    select: teamMemberSelect,
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Also guarantees at least one admin always remains: whoever is making the change is one.
  if (user.id === req.user!.id && role !== "ADMIN") {
    res.status(409).json({ error: "You can't remove your own admin access" });
    return;
  }

  if (user.participatesInLadder && !participatesInLadder) {
    const openMatches = await countOpenMatches(user.id);
    if (openMatches > 0) {
      res.status(409).json({
        error: unfinishedMatchesMessage(user.firstName, openMatches, "taking them off the ladder"),
      });
      return;
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role, participatesInLadder },
    select: teamMemberSelect,
  });
  res.json(toTeamMemberDto(updated));
});

/**
 * Removes a user from the team. This is a soft delete (sets removedAt) so their completed matches
 * stay in everyone else's history. Their sessions and any outstanding password reset links are
 * revoked in the same transaction, so they can't get a new access token; one they already hold
 * keeps working until it expires (at most JWT_ACCESS_TTL_MINUTES).
 */
export const removeTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id, removedAt: null },
    select: teamMemberSelect,
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Also guarantees at least one admin always remains: whoever is making the change is one.
  if (user.id === req.user!.id) {
    res.status(409).json({ error: "You can't remove yourself from the team" });
    return;
  }

  const openMatches = await countOpenMatches(user.id);
  if (openMatches > 0) {
    res.status(409).json({
      error: unfinishedMatchesMessage(user.firstName, openMatches, "removing them from the team"),
    });
    return;
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { removedAt: now } }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
  ]);
  res.status(204).send();
});

/**
 * Erases a person's personal data for good: name, email, rating, phone number, saved places and
 * anything they typed. Their completed matches keep a placeholder name so the other player's
 * history stays whole — playerDataService.erasePersonalData spells out exactly what survives.
 *
 * Separate from the soft removal above, and deliberately not the same button: removing someone is
 * routine and reversible, this is neither. Unlike removal it also works on someone already
 * removed, which is the usual order — take them off the team, erase on request later.
 */
export const erasePersonalDataForUser = asyncHandler(async (req: Request, res: Response) => {
  if (req.params.id === req.user!.id) {
    res.status(409).json({ error: "You can't erase your own data" });
    return;
  }

  try {
    const summary = await erasePersonalData(req.params.id);
    if (!summary) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(summary);
  } catch (err) {
    if (!(err instanceof ErasureBlockedError)) throw err;
    res.status(409).json({ error: err.message });
  }
});
