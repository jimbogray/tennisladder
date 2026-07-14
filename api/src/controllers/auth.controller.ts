import { z } from "zod";
import type { Request, Response } from "express";
import type { User } from "@prisma/client";
import type { SessionUserDto } from "@tennisladder/shared";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { hashPassword, verifyPassword } from "../auth/passwordUtils.js";
import { signAccessToken, signRefreshToken } from "../auth/authConfig.js";
import { hashToken } from "../services/tokenService.js";
import { redeemRegistrationCode, RegistrationCodeError } from "../services/registrationCodeService.js";
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
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
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

  const user = await prisma.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email,
      passwordHash: await hashPassword(data.password),
      ustaRating: data.ustaRating ?? null,
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

export const refresh = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: verify refresh cookie, rotate it, issue a new access token.
  res.status(501).json({ error: "Not implemented" });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: revoke the refresh token, clear the cookie.
  res.status(501).json({ error: "Not implemented" });
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
