import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { MatchValidationError } from "../services/matchService.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }

  // Rejected match actions (wrong turn, wrong status, not a player) are user errors, not faults.
  if (err instanceof MatchValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
