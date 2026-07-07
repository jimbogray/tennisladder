import { Router } from "express";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import * as admin from "../controllers/admin.controller.js";

export const adminRegistrationCodesRouter = Router();
adminRegistrationCodesRouter.post("/", requireAuth, requireAdmin, admin.createRegistrationCode);
adminRegistrationCodesRouter.get("/", requireAuth, requireAdmin, admin.listRegistrationCodes);
