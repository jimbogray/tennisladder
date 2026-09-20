import { Router } from "express";
import { requireAuth, requireAuthAllowingIncompleteProfile } from "../auth/middleware.js";
import * as auth from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", auth.register);
authRouter.post("/login", auth.login);
authRouter.get("/providers", auth.authProviders);
authRouter.get("/google", auth.googleStart);
authRouter.get("/google/callback", auth.googleCallback);
// The three an account still finishing its signup has to reach.
authRouter.post("/complete-profile", requireAuthAllowingIncompleteProfile, auth.completeProfile);
authRouter.post("/refresh", auth.refresh);
authRouter.post("/logout", requireAuthAllowingIncompleteProfile, auth.logout);
authRouter.get("/session", requireAuthAllowingIncompleteProfile, auth.session);
authRouter.post("/request-password-reset", auth.requestPasswordReset);
authRouter.post("/reset-password", auth.resetPassword);
authRouter.get("/verify-email/:token", auth.verifyEmail);
