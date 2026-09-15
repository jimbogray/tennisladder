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
} as const;

function toTeamMemberDto(user: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  participatesInLadder: boolean;
}) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    accountType: accountTypeFor(user),
  };
}

export const listTeamMembers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
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

  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: teamMemberSelect });
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
    const openMatches = await prisma.match.count({
      where: {
        status: { in: OPEN_MATCH_STATUSES },
        OR: [{ challengerId: user.id }, { opponentId: user.id }],
      },
    });
    if (openMatches > 0) {
      res.status(409).json({
        error: `${user.firstName} has ${openMatches} unfinished ${openMatches === 1 ? "match" : "matches"}. Finish or cancel ${openMatches === 1 ? "it" : "them"} before taking them off the ladder.`,
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
