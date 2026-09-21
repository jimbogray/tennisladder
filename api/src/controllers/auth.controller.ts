import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { hashPassword, verifyPassword } from "../auth/passwordUtils.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../auth/authConfig.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForProfile,
  generateOAuthState,
  GoogleAuthError,
  isGoogleAuthConfigured,
} from "../auth/googleOAuth.js";
import { AVATAR_IDS, USTA_RATINGS } from "@tennisladder/shared";
import { toSessionUserDto, type SessionUser } from "../auth/sessionUser.js";
import { generateOpaqueToken, hashToken } from "../services/tokenService.js";
import {
  accountFieldsFor,
  redeemRegistrationCode,
  RegistrationCodeError,
} from "../services/registrationCodeService.js";
import { sendEmail } from "../services/emailService.js";
import { addressListSchema, geocodeNewUserAddresses } from "../services/addressService.js";
import { renderPasswordResetEmail } from "../emails/templates/passwordReset.js";
import { env } from "../config/env.js";

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
};

function accessTokenFor(user: SessionUser) {
  return signAccessToken({
    sub: user.id,
    role: user.role,
    participatesInLadder: user.participatesInLadder,
    profileComplete: user.profileCompletedAt !== null,
  });
}

async function issueRefreshCookie(res: Response, user: SessionUser) {
  const refreshToken = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000),
    },
  });

  res.cookie("refreshToken", refreshToken, {
    ...refreshCookieOptions,
    maxAge: env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

async function issueSession(res: Response, user: SessionUser) {
  await issueRefreshCookie(res, user);
  res.json({ user: toSessionUserDto(user), accessToken: accessTokenFor(user) });
}

// Shared by registration and password reset so the two can't drift apart.
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email address"),
  password: passwordSchema,
  // The select's "no rating" option posts "", and anything off the NTRP scale would be handed
  // straight to a Decimal(2,1) column that throws on it — so it's rejected here instead. Same
  // shape as completeProfileSchema below, which is the other way an account gets a rating.
  ustaRating: z
    .union([z.enum(USTA_RATINGS), z.literal(""), z.null()], {
      errorMap: () => ({ message: "Choose a USTA rating from the list" }),
    })
    .optional(),
  // One of the predefined portraits, or "" for the initials badge — the same shape
  // PATCH /api/players/me takes, so the register form and the profile form can share a picker.
  avatarId: z.union([z.enum(AVATAR_IDS), z.literal("")]).optional(),
  registrationCode: z.string().length(6, "Registration code must be 6 digits"),
  // Optional places the new user travels from; they can also be added later on the profile page.
  addresses: addressListSchema.optional(),
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  const email = data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  // Ahead of redeeming the code, because this waits on OpenStreetMap: a lookup slow enough for
  // the browser to give up shouldn't leave a registration code spent on an account never created.
  const addressRows = data.addresses?.length ? await geocodeNewUserAddresses(data.addresses) : [];

  // Hashing before the transaction: bcrypt is deliberately slow, and holding a transaction open
  // across it would keep the code's row locked for no reason.
  const passwordHash = await hashPassword(data.password);

  let user;
  try {
    // One transaction, so a failure creating the account puts the code back: otherwise the
    // registrant is left holding an invite that's been spent on a user who doesn't exist.
    user = await prisma.$transaction(async (tx) => {
      const code = await redeemRegistrationCode(data.registrationCode, email, tx);

      // The invite, not the registrant, decides whether the account is a player, an admin, or both.
      const { role, participatesInLadder } = accountFieldsFor(code.accountType);

      return tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email,
          passwordHash,
          // A rating only means something for someone on the ladder.
          ustaRating: participatesInLadder ? (data.ustaRating || null) : null,
          // Unlike a rating, a portrait isn't a ladder concept, so coach-admins get one too.
          avatarId: data.avatarId || null,
          role,
          participatesInLadder,
          registrationCodeId: code.id,
          // Redeeming a code is what "finished signing up" means; only Google-first accounts
          // arrive without one and have to come back through POST /auth/complete-profile.
          profileCompletedAt: new Date(),
          // Geocoded first: only a label and coordinates are stored, never the address itself
          // (addressService). Anything the map can't place is quietly left out rather than failing
          // the registration — see geocodeNewUserAddresses.
          addresses: addressRows.length ? { create: addressRows } : undefined,
        },
      });
    });
  } catch (err) {
    if (err instanceof RegistrationCodeError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  await issueSession(res, user);
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    omit: { passwordHash: false }, // login is the one place that needs the hash
  });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  // Checked after the password, so only someone who knows it learns the account was removed.
  if (user.removedAt) {
    res.status(403).json({ error: "This account has been removed from the team" });
    return;
  }

  await issueSession(res, user);
});

/** Whether the SPA should offer the Google button at all; it's off wherever credentials are absent. */
export const authProviders = (_req: Request, res: Response) => {
  res.json({ google: isGoogleAuthConfigured() });
};

// Only has to outlive the round trip to Google's consent screen.
const OAUTH_STATE_COOKIE = "googleOAuthState";
const oauthStateCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
};

/** Sends the browser back to the SPA's login page with a message to show. */
function failSignIn(res: Response, reason: string): void {
  res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions);
  res.redirect(`${env.webAppUrl}/login?error=${encodeURIComponent(reason)}`);
}

export const googleStart = asyncHandler(async (_req: Request, res: Response) => {
  if (!isGoogleAuthConfigured()) {
    failSignIn(res, "Google sign-in isn't set up for this site");
    return;
  }

  const state = generateOAuthState();
  res.cookie(OAUTH_STATE_COOKIE, state, { ...oauthStateCookieOptions, maxAge: 10 * 60 * 1000 });
  res.redirect(buildAuthorizationUrl(state));
});

/**
 * Where Google sends the browser back. Ends in a redirect either way — there's no SPA code
 * listening for a response body at this point, so the session is handed over as the refresh
 * cookie and the SPA mints an access token from it on load, exactly as it does after a reload.
 */
export const googleCallback = asyncHandler(async (req: Request, res: Response) => {
  if (!isGoogleAuthConfigured()) {
    failSignIn(res, "Google sign-in isn't set up for this site");
    return;
  }

  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  if (error) {
    // The usual one is access_denied: the player changed their mind at the consent screen.
    failSignIn(res, error === "access_denied" ? "Google sign-in was cancelled" : "Google sign-in failed");
    return;
  }

  const expectedState = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
  if (!code || !state || !expectedState || state !== expectedState) {
    failSignIn(res, "Google sign-in couldn't be verified. Please try again.");
    return;
  }
  res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions);

  let profile;
  try {
    profile = await exchangeCodeForProfile(code);
  } catch (err) {
    if (!(err instanceof GoogleAuthError)) throw err;
    console.warn("[googleAuth] exchange failed:", err.message);
    failSignIn(res, "Google sign-in failed. Please try again.");
    return;
  }

  // An unverified address would let someone claim a club member's account by signing up to
  // Google with their email.
  if (!profile.emailVerified) {
    failSignIn(res, "Your Google account's email address isn't verified");
    return;
  }

  const user = await linkOrCreateGoogleUser(profile);
  if (!user) {
    failSignIn(res, "This account has been removed from the team");
    return;
  }

  await issueRefreshCookie(res, user);
  // A brand-new Google account still owes us an invite code before it's on the team.
  res.redirect(`${env.webAppUrl}${user.profileCompletedAt ? "/ladder" : "/complete-profile"}`);
});

/**
 * Resolves a Google identity to an account, per TL-7's merge rule: an existing account with the
 * same email adopts the Google id, so a player who registered with a password can use either way
 * in. Returns null when the account has been removed from the team.
 */
async function linkOrCreateGoogleUser(profile: {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<SessionUser | null> {
  const byGoogleId = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
  if (byGoogleId) return byGoogleId.removedAt ? null : byGoogleId;

  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    if (byEmail.removedAt) return null;
    return prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: profile.googleId,
        // Google vouched for the address, which is the same thing our own verification email asks.
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
      },
    });
  }

  // No invite code yet, so no role beyond the default and no place on the ladder until
  // POST /auth/complete-profile runs. profileCompletedAt stays null, which the token carries.
  return prisma.user.create({
    data: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      googleId: profile.googleId,
      emailVerifiedAt: new Date(),
    },
  });
}

const completeProfileSchema = z.object({
  registrationCode: z.string().length(6, "Registration code must be 6 digits"),
  ustaRating: z.union([z.enum(USTA_RATINGS), z.literal(""), z.null()]).optional(),
});

/**
 * Finishes a Google-first signup: redeems the invite code, which decides the account type, and
 * records the rating. Answers with a fresh access token because the code may have just turned
 * the account into an admin, and the old token says otherwise.
 */
export const completeProfile = asyncHandler(async (req: Request, res: Response) => {
  const { registrationCode, ustaRating } = completeProfileSchema.parse(req.body);

  const existing = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (existing.profileCompletedAt) {
    res.status(409).json({ error: "Your account is already set up" });
    return;
  }

  let user;
  try {
    // Same transaction rule as registration: if writing the account type fails, the code stays
    // redeemable rather than being spent on a profile that never got completed.
    user = await prisma.$transaction(async (tx) => {
      const code = await redeemRegistrationCode(registrationCode, existing.email, tx);
      const { role, participatesInLadder } = accountFieldsFor(code.accountType);

      return tx.user.update({
        where: { id: existing.id },
        data: {
          role,
          participatesInLadder,
          // A rating only means something for someone on the ladder — same rule as registration.
          ustaRating: participatesInLadder ? (ustaRating || null) : null,
          registrationCodeId: code.id,
          profileCompletedAt: new Date(),
        },
      });
    });
  } catch (err) {
    if (err instanceof RegistrationCodeError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  res.json({ user: toSessionUserDto(user), accessToken: accessTokenFor(user) });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  if (!refreshToken) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    res.clearCookie("refreshToken", refreshCookieOptions);
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
    res.clearCookie("refreshToken", refreshCookieOptions);
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  // Removal revokes refresh tokens too; checking removedAt here as well doesn't rely on that alone.
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.removedAt) {
    res.clearCookie("refreshToken", refreshCookieOptions);
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  // Not rotated: the refresh token stays valid until its own expiry so that concurrent
  // refresh calls (e.g. React StrictMode's double effect invocation in dev) don't race each
  // other into invalidating a token the other call still needs.
  res.json({ user: toSessionUserDto(user), accessToken: accessTokenFor(user) });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  res.clearCookie("refreshToken", refreshCookieOptions);
  res.status(204).send();
});

export const session = asyncHandler(async (req: Request, res: Response) => {
  res.json({ user: req.user ?? null });
});

// One reset email per account per minute at most, so the public endpoint can't be used to flood
// someone's inbox.
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;

const requestPasswordResetSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

/**
 * Always answers 202 with the same body, and answers before looking the account up, so neither the
 * response nor its timing reveals whether an email is registered. The token and email work happen
 * after the response is sent.
 */
export const requestPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const { email } = requestPasswordResetSchema.parse(req.body);

  res.status(202).json({ expiresInMinutes: env.passwordResetTtlMinutes });

  // The response is already sent, so a failure here must not reach the error handler.
  try {
    await issuePasswordReset(email.trim().toLowerCase());
  } catch (err) {
    console.error("[passwordReset] failed to issue reset", err);
  }
});

async function issuePasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.removedAt) return;

  const now = new Date();
  const recent = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - PASSWORD_RESET_RESEND_COOLDOWN_MS) } },
  });
  if (recent) return;

  const token = generateOpaqueToken();
  await prisma.$transaction([
    // Only the newest link works: expire any earlier ones still sitting in the inbox.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + env.passwordResetTtlMinutes * 60 * 1000),
      },
    }),
  ]);

  const resetUrl = `${env.webAppUrl}/reset-password/${token}`;
  const { subject, html } = renderPasswordResetEmail({
    recipientFirstName: user.firstName,
    resetUrl,
    expiresInMinutes: env.passwordResetTtlMinutes,
  });
  await sendEmail({ to: user.email, subject, html });
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

const INVALID_RESET_LINK = "This reset link is invalid or has expired. Request a new one.";

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = resetPasswordSchema.parse(req.body);
  const tokenHash = hashToken(token);

  // Check the token before hashing the password, so junk tokens can't make the server do bcrypt work.
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.usedAt || stored.expiresAt <= new Date()) {
    res.status(400).json({ error: INVALID_RESET_LINK });
    return;
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  const claimed = await prisma.$transaction(async (tx) => {
    // Claimed with a conditional update so two submissions of the same link can't both succeed.
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) return false;

    await tx.user.update({ where: { id: stored.userId }, data: { passwordHash } });
    await tx.passwordResetToken.updateMany({
      where: { userId: stored.userId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    // A reset usually means the old password may be compromised: sign out every existing session.
    await tx.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });

  if (!claimed) {
    res.status(400).json({ error: INVALID_RESET_LINK });
    return;
  }

  res.clearCookie("refreshToken", refreshCookieOptions);
  res.status(204).send();
});

export const verifyEmail = asyncHandler(async (_req: Request, res: Response) => {
  // TODO: verify token, set emailVerifiedAt.
  res.status(501).json({ error: "Not implemented" });
});
