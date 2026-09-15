import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { MatchValidationError } from "../services/matchService.js";
import { AddressValidationError } from "../services/addressService.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }

  // Rejected match actions (wrong turn, wrong status, not a player) and saved-address changes
  // (duplicate label, too many) are user errors, not faults.
  if (err instanceof MatchValidationError || err instanceof AddressValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
