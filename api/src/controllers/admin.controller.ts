import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { generateRegistrationCode } from "../services/registrationCodeService.js";
import { sendEmail } from "../services/emailService.js";
import { renderInviteEmail } from "../emails/templates/invite.js";
import { env } from "../config/env.js";

const createCodeSchema = z.object({ intendedForNote: z.string().optional() });

export const createRegistrationCode = asyncHandler(async (req: Request, res: Response) => {
  const { intendedForNote } = createCodeSchema.parse(req.body ?? {});
  const code = await generateRegistrationCode(req.user!.id, intendedForNote);
  res.status(201).json(code);
});

const inviteSchema = z.object({ email: z.string().email("Enter a valid email address") });

/**
 * Issues a registration code and emails it as a one-click invite link. The code is created first
 * and kept even if the send fails, so an admin can fall back to reading the code out manually.
 */
export const inviteByEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email } = inviteSchema.parse(req.body);
  const invitedEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email: invitedEmail } });
  if (existingUser) {
    res.status(409).json({ error: "That email address already has an account" });
    return;
  }

  const code = await generateRegistrationCode(req.user!.id, undefined, invitedEmail);

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
