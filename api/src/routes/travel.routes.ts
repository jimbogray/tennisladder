import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import * as travel from "../controllers/travel.controller.js";

export const travelRouter = Router();

// Private to the caller: a departure time is worked out from one of their own saved addresses.
travelRouter.get("/departure", requireAuth, travel.getDeparture);
