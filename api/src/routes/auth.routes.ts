import { Router } from "express";
import { requireAuth, requireAuthAllowingIncompleteProfile } from "../auth/middleware.js";
import * as auth from "../controllers/auth.controller.js";
import {
  codeRedemptionLimiter,
  loginByAccountLimiter,
  loginByIpLimiter,
  passwordResetLimiter,
} from "../middleware/rateLimit.js";

export const authRouter = Router();

authRouter.post("/register", codeRedemptionLimiter, auth.register);
// Per-account first: it is the tighter limit, and the one an attacker has to cross.
authRouter.post("/login", loginByAccountLimiter, loginByIpLimiter, auth.login);
authRouter.get("/providers", auth.authProviders);
authRouter.get("/google", auth.googleStart);
authRouter.get("/google/callback", auth.googleCallback);
// The three an account still finishing its signup has to reach.
authRouter.post(
  "/complete-profile",
  codeRedemptionLimiter,
  requireAuthAllowingIncompleteProfile,
  auth.completeProfile,
);
authRouter.post("/refresh", auth.refresh);
authRouter.post("/logout", requireAuthAllowingIncompleteProfile, auth.logout);
authRouter.get("/session", requireAuthAllowingIncompleteProfile, auth.session);
authRouter.post("/request-password-reset", passwordResetLimiter, auth.requestPasswordReset);
authRouter.post("/reset-password", passwordResetLimiter, auth.resetPassword);
authRouter.get("/verify-email/:token", auth.verifyEmail);
