import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { hashPassword, verifyPassword } from "../auth/passwordUtils.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../auth/authConfig.js";
import { toSessionUserDto, type SessionUser } from "../auth/sessionUser.js";
import { generateOpaqueToken, hashToken } from "../services/tokenService.js";
import {
  accountFieldsFor,
  redeemRegistrationCode,
  RegistrationCodeError,
} from "../services/registrationCodeService.js";
import { sendEmail } from "../services/emailService.js";
import { renderPasswordResetEmail } from "../emails/templates/passwordReset.js";
import { env } from "../config/env.js";

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
};

async function issueSession(res: Response, user: SessionUser) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    participatesInLadder: user.participatesInLadder,
  });
  const refreshToken = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000),
    },
  });

  res.cookie("refreshToken", refreshToken, {
    ...refreshCookieOptions,
    maxAge: env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000,
  });

  res.json({ user: toSessionUserDto(user), accessToken });
}

// Shared by registration and password reset so the two can't drift apart.
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email address"),
  password: passwordSchema,
  ustaRating: z.string().optional(),
  registrationCode: z.string().length(4, "Registration code must be 4 digits"),
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  const email = data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  let code;
  try {
    code = await redeemRegistrationCode(data.registrationCode);
  } catch (err) {
    if (err instanceof RegistrationCodeError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  // The invite, not the registrant, decides whether the account is a player, an admin, or both.
  const { role, participatesInLadder } = accountFieldsFor(code.accountType);
  const user = await prisma.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email,
      passwordHash: await hashPassword(data.password),
      // A rating only means something for someone on the ladder.
      ustaRating: participatesInLadder ? (data.ustaRating ?? null) : null,
      role,
      participatesInLadder,
      registrationCodeId: code.id,
    },
  });

  await issueSession(res, user);
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    omit: { passwordHash: false }, // login is the one place that needs the hash
  });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  await issueSession(res, user);
});

export const googleStart = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: redirect to Google's OAuth consent screen.
  res.status(501).json({ error: "Not implemented" });
});

export const googleCallback = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: exchange code, upsert User by googleId/email, redirect to /complete-profile if
  // profileCompletedAt is null, else issue tokens and redirect to the SPA.
  res.status(501).json({ error: "Not implemented" });
});

export const completeProfile = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: capture ustaRating + registrationCode for a Google-first signup, set profileCompletedAt.
  res.status(501).json({ error: "Not implemented" });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  if (!refreshToken) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    res.clearCookie("refreshToken", refreshCookieOptions);
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
    res.clearCookie("refreshToken", refreshCookieOptions);
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    res.clearCookie("refreshToken", refreshCookieOptions);
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  // Not rotated: the refresh token stays valid until its own expiry so that concurrent
  // refresh calls (e.g. React StrictMode's double effect invocation in dev) don't race each
  // other into invalidating a token the other call still needs.
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    participatesInLadder: user.participatesInLadder,
  });
  res.json({ user: toSessionUserDto(user), accessToken });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  res.clearCookie("refreshToken", refreshCookieOptions);
  res.status(204).send();
});

export const session = asyncHandler(async (req: Request, res: Response) => {
  res.json({ user: req.user ?? null });
});

// One reset email per account per minute at most, so the public endpoint can't be used to flood
// someone's inbox.
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;

const requestPasswordResetSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

/**
 * Always answers 202 with the same body, and answers before looking the account up, so neither the
 * response nor its timing reveals whether an email is registered. The token and email work happen
 * after the response is sent.
 */
export const requestPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const { email } = requestPasswordResetSchema.parse(req.body);

  res.status(202).json({ expiresInMinutes: env.passwordResetTtlMinutes });

  // The response is already sent, so a failure here must not reach the error handler.
  try {
    await issuePasswordReset(email.trim().toLowerCase());
  } catch (err) {
    console.error("[passwordReset] failed to issue reset", err);
  }
});

async function issuePasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const now = new Date();
  const recent = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - PASSWORD_RESET_RESEND_COOLDOWN_MS) } },
  });
  if (recent) return;

  const token = generateOpaqueToken();
  await prisma.$transaction([
    // Only the newest link works: expire any earlier ones still sitting in the inbox.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + env.passwordResetTtlMinutes * 60 * 1000),
      },
    }),
  ]);

  const resetUrl = `${env.webAppUrl}/reset-password/${token}`;
  if (!env.azureCommunicationConnectionString && process.env.NODE_ENV !== "production") {
    // Local dev has no email, so surface the link where the developer can click it.
    console.info(`[passwordReset] email not configured; reset link for ${email}: ${resetUrl}`);
  }

  const { subject, html } = renderPasswordResetEmail({
    recipientFirstName: user.firstName,
    resetUrl,
    expiresInMinutes: env.passwordResetTtlMinutes,
  });
  await sendEmail({ to: user.email, subject, html });
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

const INVALID_RESET_LINK = "This reset link is invalid or has expired. Request a new one.";

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = resetPasswordSchema.parse(req.body);
  const tokenHash = hashToken(token);

  // Check the token before hashing the password, so junk tokens can't make the server do bcrypt work.
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.usedAt || stored.expiresAt <= new Date()) {
    res.status(400).json({ error: INVALID_RESET_LINK });
    return;
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  const claimed = await prisma.$transaction(async (tx) => {
    // Claimed with a conditional update so two submissions of the same link can't both succeed.
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) return false;

    await tx.user.update({ where: { id: stored.userId }, data: { passwordHash } });
    await tx.passwordResetToken.updateMany({
      where: { userId: stored.userId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    // A reset usually means the old password may be compromised: sign out every existing session.
    await tx.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });

  if (!claimed) {
    res.status(400).json({ error: INVALID_RESET_LINK });
    return;
  }

  res.clearCookie("refreshToken", refreshCookieOptions);
  res.status(204).send();
});

export const verifyEmail = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: verify token, set emailVerifiedAt.
  res.status(501).json({ error: "Not implemented" });
});
