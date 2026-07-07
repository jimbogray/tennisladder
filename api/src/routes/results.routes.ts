import { Router } from "express";
import * as results from "../controllers/results.controller.js";

// Public — the token itself is the credential (secure unique tokenized "I won"/"I lost" links).
export const resultsRouter = Router();
resultsRouter.get("/token/:token", results.resolveResultToken);
resultsRouter.post("/token/:token", results.submitResultViaToken);
