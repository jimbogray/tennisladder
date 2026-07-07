import { Router } from "express";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import * as locations from "../controllers/locations.controller.js";

export const locationsRouter = Router();
locationsRouter.get("/", requireAuth, locations.listLocations);

export const adminLocationsRouter = Router();
adminLocationsRouter.post("/", requireAuth, requireAdmin, locations.createLocation);
adminLocationsRouter.patch("/:id", requireAuth, requireAdmin, locations.updateLocation);
adminLocationsRouter.delete("/:id", requireAuth, requireAdmin, locations.deleteLocation);
