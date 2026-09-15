import { Router } from "express";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import * as admin from "../controllers/admin.controller.js";

export const adminRegistrationCodesRouter = Router();
adminRegistrationCodesRouter.post("/", requireAuth, requireAdmin, admin.createRegistrationCode);
adminRegistrationCodesRouter.get("/", requireAuth, requireAdmin, admin.listRegistrationCodes);
adminRegistrationCodesRouter.post("/invite", requireAuth, requireAdmin, admin.inviteByEmail);
adminRegistrationCodesRouter.post(
  "/:id/expire",
  requireAuth,
  requireAdmin,
  admin.expireRegistrationCode,
);

export const adminUsersRouter = Router();
adminUsersRouter.get("/", requireAuth, requireAdmin, admin.listTeamMembers);
adminUsersRouter.patch("/:id/account-type", requireAuth, requireAdmin, admin.updateTeamMemberAccountType);
adminUsersRouter.delete("/:id", requireAuth, requireAdmin, admin.removeTeamMember);
