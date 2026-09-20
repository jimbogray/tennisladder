import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** Thrown when Google's side of the exchange fails. Surfaced to the user as a failed sign-in. */
export class GoogleAuthError extends Error {}

/**
 * Google sign-in is optional: without credentials the endpoints refuse and the SPA hides the
 * button, which is how local dev and staging run.
 */
export function isGoogleAuthConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret && env.googleCallbackUrl);
}

export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Where to send the browser to ask for consent. `state` is echoed back by Google and compared
 * with the cookie set alongside it, which is what stops a third party from feeding us their own
 * authorization code. No PKCE: this is a confidential client, so the code can only be redeemed
 * with the secret, which never leaves the server.
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleCallbackUrl,
    response_type: "code",
    scope: "openid email profile",
    state,
    // Google only returns an email for accounts that have one; asking to pick avoids silently
    // reusing whichever account the browser happens to be signed into.
    prompt: "select_account",
  });
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
}

/**
 * Trades the one-time code for tokens, then reads the profile from Google's userinfo endpoint.
 * Using userinfo rather than decoding the `id_token` keeps this free of unverified JWT handling:
 * the answer comes straight from Google over TLS, authenticated by the access token.
 */
export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleCallbackUrl,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new GoogleAuthError(`Token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }

  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
  if (!accessToken) throw new GoogleAuthError("Token exchange returned no access token");

  const userinfoRes = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!userinfoRes.ok) {
    throw new GoogleAuthError(`Userinfo request failed (${userinfoRes.status})`);
  }

  const profile = (await userinfoRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    given_name?: string;
    family_name?: string;
    name?: string;
  };

  if (!profile.sub || !profile.email) {
    throw new GoogleAuthError("Google returned a profile without an id or email");
  }

  // Google Workspace accounts sometimes send only `name`; split it so the ladder still shows
  // something sensible, and let the player fix it on their profile afterwards.
  const [fallbackFirst = "", ...fallbackRest] = (profile.name ?? "").trim().split(/\s+/);

  return {
    googleId: profile.sub,
    email: profile.email.toLowerCase(),
    emailVerified: profile.email_verified === true,
    firstName: profile.given_name || fallbackFirst || profile.email.split("@")[0],
    lastName: profile.family_name || fallbackRest.join(" "),
  };
}
