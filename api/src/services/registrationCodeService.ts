import { randomInt } from "node:crypto";
import { Prisma, type AccountType, type UserRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";

function generateSixDigitCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

/** A unique-constraint violation, which for this insert means the code is already in active use. */
function isCodeCollision(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Generates a unique, active, 6-digit registration code. Active-code uniqueness is enforced at
 * the DB level by a partial unique index (WHERE "usedAt" IS NULL), added in the
 * `registration_code_active_unique` migration, so on the rare collision this simply retries.
 */
export async function generateRegistrationCode(
  createdByAdminId: string,
  options: { accountType: AccountType; intendedForNote?: string; invitedEmail?: string },
) {
  const { accountType, intendedForNote, invitedEmail } = options;
  const expiresAt = new Date(Date.now() + env.registrationCodeTtlHours * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.registrationCode.create({
        data: {
          code: generateSixDigitCode(),
          createdByAdminId,
          intendedForNote,
          invitedEmail,
          accountType,
          expiresAt,
        },
      });
    } catch (err) {
      // A collision is the one failure worth another go with a fresh code. Anything else — a
      // dropped connection, a createdByAdminId that isn't a real admin — would fail identically
      // five times over, so it surfaces immediately instead.
      if (!isCodeCollision(err) || attempt === 4) throw err;
    }
  }
  throw new Error("Failed to generate a unique registration code");
}

/**
 * What an invite's account type grants on redemption. Admin-only accounts are coach-admins, kept
 * off the ladder; see participatesInLadder on User.
 */
export function accountFieldsFor(accountType: AccountType): {
  role: UserRole;
  participatesInLadder: boolean;
} {
  switch (accountType) {
    case "PLAYER":
      return { role: "PLAYER", participatesInLadder: true };
    case "ADMIN":
      return { role: "ADMIN", participatesInLadder: false };
    case "PLAYER_ADMIN":
      return { role: "ADMIN", participatesInLadder: true };
  }
}

/**
 * The inverse of {@link accountFieldsFor}, for showing an existing user's type. A PLAYER who has
 * left the ladder isn't something an invite can create; it reads as PLAYER here.
 */
export function accountTypeFor(user: { role: UserRole; participatesInLadder: boolean }): AccountType {
  if (user.role === "PLAYER") return "PLAYER";
  return user.participatesInLadder ? "PLAYER_ADMIN" : "ADMIN";
}

/** Thrown when a registration code can't be redeemed. Callers should surface this as a 400. */
export class RegistrationCodeError extends Error {}

/**
 * Atomically redeems an active registration code: looks it up by value (usedAt IS NULL), verifies
 * it hasn't expired, checks it against the email redeeming it, marks it used, and returns it.
 * Throws {@link RegistrationCodeError} otherwise.
 *
 * A code created by emailing an invite carries the address it was sent to, and only that address
 * may redeem it — an emailed invite is for one person, not a code anyone forwarded can use. Codes
 * generated for manual handout have no invitedEmail and stay redeemable by anyone holding them.
 * The check runs inside the transaction so a mismatch leaves the code unused and still redeemable
 * by its intended recipient.
 */
export async function redeemRegistrationCode(code: string, redeemingEmail: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.registrationCode.findFirst({
      where: { code, usedAt: null },
    });
    if (!existing) {
      throw new RegistrationCodeError("Invalid or already-used registration code");
    }
    if (existing.expiresAt <= new Date()) {
      throw new RegistrationCodeError("Registration code has expired");
    }
    // invitedEmail is stored lowercased when the invite is issued; normalize both sides anyway.
    if (
      existing.invitedEmail &&
      existing.invitedEmail.toLowerCase() !== redeemingEmail.trim().toLowerCase()
    ) {
      throw new RegistrationCodeError(
        "This invite was sent to a different email address. Sign up with the address your club admin invited, or ask them for a new code.",
      );
    }
    return tx.registrationCode.update({
      where: { id: existing.id },
      data: { usedAt: new Date() },
    });
  });
}
