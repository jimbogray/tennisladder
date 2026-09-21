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
// POST rather than DELETE: it doesn't delete the row, and the two actions are deliberately
// different requests so a client can't reach the irreversible one by accident.
adminUsersRouter.post(
  "/:id/erase-personal-data",
  requireAuth,
  requireAdmin,
  admin.erasePersonalDataForUser,
);
