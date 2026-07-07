import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./authConfig.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      participatesInLadder: payload.participatesInLadder,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Admin privileges required" });
    return;
  }
  next();
}

// A coach-admin still passes requireAdmin (role === ADMIN) but should be blocked from
// challenge/ladder-participation endpoints via this guard (req.user.participatesInLadder === false).
export function requireLadderParticipant(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.participatesInLadder) {
    res.status(403).json({ error: "This account does not participate in the ladder" });
    return;
  }
  next();
}
