import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./authConfig.js";

function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
  { allowIncompleteProfile }: { allowIncompleteProfile: boolean },
): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Tokens minted before this field existed have no opinion, and belong to accounts that
  // registered with a code — treat only an explicit false as incomplete.
  const profileComplete = payload.profileComplete !== false;
  if (!profileComplete && !allowIncompleteProfile) {
    res.status(403).json({ error: "Finish setting up your account first", code: "PROFILE_INCOMPLETE" });
    return;
  }

  req.user = {
    id: payload.sub,
    role: payload.role,
    participatesInLadder: payload.participatesInLadder,
    profileComplete,
  };
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  authenticate(req, res, next, { allowIncompleteProfile: false });
}

/**
 * For the handful of endpoints a half-finished signup still needs: reading its own session,
 * completing the profile, and signing out.
 */
export function requireAuthAllowingIncompleteProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  authenticate(req, res, next, { allowIncompleteProfile: true });
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
