import type { Request, Response } from "express";
import rateLimit, { ipKeyGenerator, MINUTE, HOUR } from "express-rate-limit";

/**
 * Rate limiters for the public endpoints.
 *
 * Counters live in memory, which assumes the single always-on replica the scheduler already
 * assumes (minReplicas=maxReplicas=1). If that ever changes, each replica would keep its own
 * tally and the effective limits would multiply by the replica count — move to a shared store
 * before scaling out.
 *
 * Limits are deliberately loose on the IP dimension. A club's players are often on the same
 * court-side wifi, so one public IP can legitimately mean twenty people signing in at once; a
 * tight per-IP cap would lock out the whole club to slow down one attacker. The tight limit is
 * per *account* instead, which is the dimension an attacker actually has to cross.
 */

/** Matches the error shape the SPA already renders (see apiFetch in web/src/api/client.ts). */
function tooManyRequests(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ error: message });
  };
}

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? "");

/**
 * A backstop against scraping and runaway clients, not a security control. Generous enough that
 * a full club behind one address never reaches it in ordinary use.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 1200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: tooManyRequests("Too many requests. Please wait a moment and try again."),
});

/**
 * The real brute-force control: failed sign-ins for one email address, wherever they come from.
 * Successful logins don't count, so someone mistyping a password twice then getting it right is
 * unaffected, and an attacker with many IPs still can't exceed this on a single account.
 */
export const loginByAccountLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    // No email in the body means the request will fail validation anyway; fall back to the IP
    // so a flood of malformed logins is still bounded.
    return email ? `account:${email}` : `ip:${ipKey(req)}`;
  },
  handler: tooManyRequests(
    "Too many sign-in attempts for this account. Please wait 15 minutes and try again, or reset your password.",
  ),
});

/** Catches credential stuffing that spreads across many accounts from one source. */
export const loginByIpLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 60,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: tooManyRequests("Too many sign-in attempts. Please wait 15 minutes and try again."),
});

/**
 * The per-account 60s cooldown in requestPasswordReset already stops one inbox being flooded;
 * this caps the total rate across many addresses.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: HOUR,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: tooManyRequests("Too many password reset requests. Please wait an hour and try again."),
});

/**
 * Invite-code redemption, on both the password and Google-first signup paths. Registering is a
 * once-per-player event, so a low ceiling costs nothing legitimate while making it impractical to
 * walk the code space — which matters because a PLAYER_ADMIN/ADMIN invite grants admin rights.
 */
export const codeRedemptionLimiter = rateLimit({
  windowMs: HOUR,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: tooManyRequests(
    "Too many registration attempts. Please wait an hour, or ask your club admin for a fresh invite.",
  ),
});
