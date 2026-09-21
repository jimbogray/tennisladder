import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  // Behind the Container Apps ingress the socket address is the proxy's, so req.ip — which every
  // rate limiter keys off — would otherwise be identical for every caller.
  app.set("trust proxy", env.trustProxyHops);

  app.use(cors({ origin: env.webAppUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api", apiRouter);

  app.use(errorHandler);

  return app;
}
