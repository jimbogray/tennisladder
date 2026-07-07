import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";

const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  ustaRating: z.string().optional(),
  registrationCode: z.string().length(4),
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  registerSchema.parse(req.body);
  // TODO: redeemRegistrationCode, hashPassword, create User, issue access+refresh tokens.
  res.status(501).json({ error: "Not implemented" });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  loginSchema.parse(req.body);
  // TODO: verifyPassword against stored hash, issue access+refresh tokens.
  res.status(501).json({ error: "Not implemented" });
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
