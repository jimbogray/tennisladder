import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { playersRouter, adminPlayersRouter } from "./players.routes.js";
import { locationsRouter, adminLocationsRouter } from "./locations.routes.js";
import { matchesRouter, adminMatchesRouter } from "./matches.routes.js";
import { resultsRouter } from "./results.routes.js";
import { travelRouter } from "./travel.routes.js";
import { adminRegistrationCodesRouter, adminUsersRouter } from "./admin.routes.js";
import { globalLimiter } from "../middleware/rateLimit.js";

export const apiRouter = Router();

// Unmetered, and ahead of the global limiter: this is the platform's liveness probe. `clientIp`
// is the address the API resolved for the caller, which is how the `trust proxy` setting that all
// the rate limiting depends on gets verified in a hosted environment.
apiRouter.get("/health", (req, res) => res.json({ status: "ok", clientIp: req.ip }));

apiRouter.use(globalLimiter);

apiRouter.use("/auth", authRouter);
apiRouter.use("/players", playersRouter);
apiRouter.use("/locations", locationsRouter);
apiRouter.use("/matches", matchesRouter);
apiRouter.use("/results", resultsRouter);
apiRouter.use("/travel", travelRouter);

apiRouter.use("/admin/players", adminPlayersRouter);
apiRouter.use("/admin/locations", adminLocationsRouter);
apiRouter.use("/admin/matches", adminMatchesRouter);
apiRouter.use("/admin/registration-codes", adminRegistrationCodesRouter);
apiRouter.use("/admin/users", adminUsersRouter);
