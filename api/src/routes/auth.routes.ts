import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import * as auth from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", auth.register);
authRouter.post("/login", auth.login);
authRouter.get("/google", auth.googleStart);
authRouter.get("/google/callback", auth.googleCallback);
authRouter.post("/complete-profile", requireAuth, auth.completeProfile);
authRouter.post("/refresh", auth.refresh);
authRouter.post("/logout", requireAuth, auth.logout);
authRouter.get("/session", requireAuth, auth.session);
authRouter.post("/request-password-reset", auth.requestPasswordReset);
authRouter.post("/reset-password", auth.resetPassword);
authRouter.get("/verify-email/:token", auth.verifyEmail);
