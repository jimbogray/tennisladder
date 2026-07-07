import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  participatesInLadder: boolean;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: `${env.jwtAccessTtlMinutes}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtRefreshSecret, {
    expiresIn: `${env.jwtRefreshTtlDays}d`,
  });
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { sub: string };
}

// TODO: Google OAuth 2.0 code exchange + id_token verification.
// Session strategy is JWT (not Auth.js DB sessions), since Auth.js does not support DB sessions
// alongside a Credentials provider. Wire either @auth/express's Google provider (id_token only,
// no adapter) or passport-google-oauth20 here; either way it should resolve to an upsert against
// the `User` table by googleId/email and then call signAccessToken/signRefreshToken like the
// credentials login path does. See docs/architecture.md "Key Risk Flag" for the fallback plan.
