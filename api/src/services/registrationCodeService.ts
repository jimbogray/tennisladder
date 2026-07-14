import { randomInt } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";

function generateFourDigitCode(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

/**
 * Generates a unique, active, 4-digit registration code. Active-code uniqueness is enforced at
 * the DB level by a partial unique index (WHERE used_at IS NULL) — see prisma/MIGRATION_NOTES.md —
 * so on the rare collision this simply retries.
 */
export async function generateRegistrationCode(createdByAdminId: string, intendedForNote?: string) {
  const expiresAt = new Date(Date.now() + env.registrationCodeTtlHours * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.registrationCode.create({
        data: {
          code: generateFourDigitCode(),
          createdByAdminId,
          intendedForNote,
          expiresAt,
        },
      });
    } catch (err) {
      // TODO: narrow to Prisma unique-constraint violation (P2002) before retrying; rethrow otherwise.
      if (attempt === 4) throw err;
    }
  }
  throw new Error("Failed to generate a unique registration code");
}

/** Thrown when a registration code can't be redeemed. Callers should surface this as a 400. */
export class RegistrationCodeError extends Error {}

/**
 * Atomically redeems an active registration code: looks it up by value (usedAt IS NULL), verifies
 * it hasn't expired, marks it used, and returns it. Throws {@link RegistrationCodeError} otherwise.
 */
export async function redeemRegistrationCode(code: string) {
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
    return tx.registrationCode.update({
      where: { id: existing.id },
      data: { usedAt: new Date() },
    });
  });
}
