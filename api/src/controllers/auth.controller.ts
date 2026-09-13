import { z } from "zod";
import type { Request, Response } from "express";
import type { User } from "@prisma/client";
import type { SessionUserDto } from "@tennisladder/shared";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { hashPassword, verifyPassword } from "../auth/passwordUtils.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../auth/authConfig.js";
import { hashToken } from "../services/tokenService.js";
import {
  accountFieldsFor,
  redeemRegistrationCode,
  RegistrationCodeError,
} from "../services/registrationCodeService.js";
import { env } from "../config/env.js";

// Accept a User without the (globally omitted) passwordHash — these helpers never read it.
type SessionUser = Omit<User, "passwordHash">;

function toSessionUserDto(user: SessionUser): SessionUserDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    participatesInLadder: user.participatesInLadder,
    points: user.points,
    email: user.email,
    ustaRating: user.ustaRating?.toString() ?? null,
    profileCompletedAt: user.profileCompletedAt?.toISOString() ?? null,
  };
}

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

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
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

export const requestPasswordReset = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: create PasswordResetToken, send renderPasswordResetEmail.
  res.status(501).json({ error: "Not implemented" });
});

export const resetPassword = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: verify token hash + expiry, set new passwordHash, mark token used.
  res.status(501).json({ error: "Not implemented" });
});

export const verifyEmail = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: verify token, set emailVerifiedAt.
  res.status(501).json({ error: "Not implemented" });
});
