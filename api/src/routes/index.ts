import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { playersRouter, adminPlayersRouter } from "./players.routes.js";
import { locationsRouter, adminLocationsRouter } from "./locations.routes.js";
import { matchesRouter, adminMatchesRouter } from "./matches.routes.js";
import { resultsRouter } from "./results.routes.js";
import { adminRegistrationCodesRouter } from "./admin.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ status: "ok" }));

apiRouter.use("/auth", authRouter);
apiRouter.use("/players", playersRouter);
apiRouter.use("/locations", locationsRouter);
apiRouter.use("/matches", matchesRouter);
apiRouter.use("/results", resultsRouter);

apiRouter.use("/admin/players", adminPlayersRouter);
apiRouter.use("/admin/locations", adminLocationsRouter);
apiRouter.use("/admin/matches", adminMatchesRouter);
apiRouter.use("/admin/registration-codes", adminRegistrationCodesRouter);
