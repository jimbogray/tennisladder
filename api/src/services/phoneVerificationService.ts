import { randomInt } from "node:crypto";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { hashToken } from "./tokenService.js";
import { sendSms } from "./smsService.js";

/**
 * Registering a notification phone number: the user enters a number, we text them a six-digit
 * code, and the number is only written to `User.phoneNumber` once that code comes back. Until
 * then the candidate lives on a `PhoneVerification` row, so abandoning the flow halfway — or
 * mistyping a digit — leaves a number that already works untouched.
 */

/** Six digits falls to brute force fast, so a code is spent after a handful of wrong tries. */
const MAX_CODE_ATTEMPTS = 5;

/** Long enough to cover a slow carrier, short enough that nobody can hammer "resend". */
const RESEND_COOLDOWN_MS = 60 * 1000;

/** E.164: a leading +, a country code that can't start with 0, and 15 digits at the outside. */
const E164 = /^\+[1-9]\d{7,14}$/;

/** North American numbers are always exactly ten digits after the +1. */
const NANP_LENGTH = "+1".length + 10;

export class PhoneNumberError extends Error {}

export const startPhoneVerificationSchema = z.object({
  phoneNumber: z.string().trim().min(1, "Enter a phone number"),
});

export const confirmPhoneVerificationSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the text message"),
});

/**
 * Turns what a user typed into E.164. People write numbers with spaces, dashes, dots and brackets
 * in them and none of that is meaningful, so only the digits survive — but the leading `+` has to
 * be there, because without it there's no telling a country code from the start of a local number.
 * The form always supplies one (defaulting to +1), so a missing `+` means someone overwrote it.
 *
 * Throws {@link PhoneNumberError}, whose message is written to be shown to the user as-is.
 */
export function normalizePhoneNumber(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("+")) {
    throw new PhoneNumberError("Start with a country code, like +1.");
  }

  const normalized = `+${trimmed.replace(/\D/g, "")}`;
  if (!E164.test(normalized)) {
    throw new PhoneNumberError("That doesn't look like a phone number. Check the digits and try again.");
  }
  // Without this a nine-digit US number would pass as some other country's shorter one, and the
  // user would be left waiting for a text that was never going anywhere.
  if (normalized.startsWith("+1") && normalized.length !== NANP_LENGTH) {
    throw new PhoneNumberError("A +1 number needs 10 digits after the country code, like +1 555 123 4567.");
  }
  return normalized;
}

function generateSixDigitCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export class PhoneVerificationError extends Error {
  constructor(
    message: string,
    /** What the route should answer with — these map onto distinct user-facing situations. */
    public status: 400 | 429 | 502,
  ) {
    super(message);
  }
}

/**
 * Texts a fresh code to `rawPhoneNumber` and records it against the user, superseding any code
 * still in flight — only the newest one works, including when the user has changed their mind
 * about which number they're registering.
 *
 * Returns the number as it was normalized, so the page can echo back what it actually texted.
 */
export async function startPhoneVerification(
  userId: string,
  rawPhoneNumber: string,
): Promise<{ phoneNumber: string; expiresInMinutes: number }> {
  const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
  const now = new Date();

  const recent = await prisma.phoneVerification.findFirst({
    where: { userId, createdAt: { gt: new Date(now.getTime() - RESEND_COOLDOWN_MS) } },
  });
  if (recent) {
    throw new PhoneVerificationError(
      "We've just sent you a code. Give it a minute before asking for another.",
      429,
    );
  }

  const code = generateSixDigitCode();
  const verification = await prisma.$transaction(async (tx) => {
    await tx.phoneVerification.updateMany({
      where: { userId, verifiedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    return tx.phoneVerification.create({
      data: {
        userId,
        phoneNumber,
        codeHash: hashToken(code),
        expiresAt: new Date(now.getTime() + env.phoneVerificationTtlMinutes * 60 * 1000),
      },
    });
  });

  try {
    await sendSms({
      to: phoneNumber,
      message:
        `${code} is your Tennis Ladder confirmation code. ` +
        `It expires in ${env.phoneVerificationTtlMinutes} minutes.`,
    });
  } catch (err) {
    console.error("[phoneVerification] failed to send code", err);
    // This row is what makes the resend cooldown bite, and a code that never left the building
    // shouldn't cost the user a minute of waiting — so drop it rather than expire it.
    await prisma.phoneVerification.delete({ where: { id: verification.id } });
    throw new PhoneVerificationError(
      "We couldn't send a text to that number. Check it and try again.",
      502,
    );
  }

  return { phoneNumber, expiresInMinutes: env.phoneVerificationTtlMinutes };
}

const WRONG_CODE = "That code is wrong or has expired. Ask for a new one.";

/**
 * Checks `code` against the user's newest live verification and, on a match, promotes its number
 * to `User.phoneNumber`. Returns the updated user.
 */
export async function confirmPhoneVerification(userId: string, code: string) {
  const now = new Date();

  const pending = await prisma.phoneVerification.findFirst({
    where: {
      userId,
      verifiedAt: null,
      expiresAt: { gt: now },
      attempts: { lt: MAX_CODE_ATTEMPTS },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) {
    throw new PhoneVerificationError(WRONG_CODE, 400);
  }

  if (pending.codeHash !== hashToken(code)) {
    const { attempts } = await prisma.phoneVerification.update({
      where: { id: pending.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    throw new PhoneVerificationError(
      attempts >= MAX_CODE_ATTEMPTS ? "Too many wrong codes. Ask for a new one." : WRONG_CODE,
      400,
    );
  }

  const user = await prisma.$transaction(async (tx) => {
    // Claimed with a conditional update, so a double-submit can't verify the same code twice.
    const { count } = await tx.phoneVerification.updateMany({
      where: { id: pending.id, verifiedAt: null, expiresAt: { gt: now } },
      data: { verifiedAt: now },
    });
    if (count === 0) return null;
    return tx.user.update({ where: { id: userId }, data: { phoneNumber: pending.phoneNumber } });
  });
  if (!user) {
    throw new PhoneVerificationError(WRONG_CODE, 400);
  }
  return user;
}

/**
 * Unregisters the user's number. Any code still in flight goes with it, so a text arriving after
 * they've opted out can't quietly put the number back.
 */
export async function removePhoneNumber(userId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.phoneVerification.updateMany({
      where: { userId, verifiedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    return tx.user.update({ where: { id: userId }, data: { phoneNumber: null } });
  });
}
