import { randomUUID } from "node:crypto";
import type { AccountType, UserRole } from "@prisma/client";
import { prisma } from "../../src/config/prisma.js";

export { prisma };

/**
 * Empties every table between tests.
 *
 * Not a transaction-per-test rollback: the services under test open their own interactive
 * transactions (`prisma.$transaction`), which can't be nested inside one the test holds open.
 * TRUNCATE ... CASCADE is the next cheapest thing, and it also resets the sequences so a test
 * never depends on ids left behind by the one before it.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) {
    throw new Error(
      "The test database has no tables. Run `npm run test` from api/, which applies migrations " +
        "first, or `prisma migrate deploy` against TEST_DATABASE_URL yourself.",
    );
  }
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Every factory email is unique, so tests never collide on the User.email constraint. */
function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@example.test`;
}

export interface CreateUserOptions {
  firstName?: string;
  lastName?: string;
  email?: string;
  points?: number;
  role?: UserRole;
  participatesInLadder?: boolean;
  /** Null marks a Google-first signup that hasn't redeemed an invite yet. */
  profileCompletedAt?: Date | null;
  removedAt?: Date | null;
  passwordHash?: string;
}

export async function createUser(options: CreateUserOptions = {}) {
  const firstName = options.firstName ?? "Test";
  return prisma.user.create({
    data: {
      firstName,
      lastName: options.lastName ?? "Player",
      email: options.email ?? uniqueEmail(firstName.toLowerCase()),
      points: options.points ?? 0,
      role: options.role ?? "PLAYER",
      participatesInLadder: options.participatesInLadder ?? true,
      profileCompletedAt:
        options.profileCompletedAt === undefined ? new Date() : options.profileCompletedAt,
      removedAt: options.removedAt ?? null,
      passwordHash: options.passwordHash ?? null,
    },
  });
}

export async function createLocation(name = `Court ${randomUUID().slice(0, 8)}`) {
  return prisma.location.create({ data: { name } });
}

export interface CreateRegistrationCodeOptions {
  code?: string;
  accountType?: AccountType;
  invitedEmail?: string;
  expiresAt?: Date;
  usedAt?: Date | null;
}

export async function createRegistrationCode(
  createdByAdminId: string,
  options: CreateRegistrationCodeOptions = {},
) {
  return prisma.registrationCode.create({
    data: {
      code: options.code ?? String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"),
      createdByAdminId,
      accountType: options.accountType ?? "PLAYER",
      invitedEmail: options.invitedEmail,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      usedAt: options.usedAt ?? null,
    },
  });
}

/** Two ladder players and a court — the starting point for almost every match test. */
export async function createLadderFixture(
  options: { challengerPoints?: number; opponentPoints?: number } = {},
) {
  const [challenger, opponent, location] = await Promise.all([
    createUser({ firstName: "Cara", points: options.challengerPoints ?? 0 }),
    createUser({ firstName: "Omar", points: options.opponentPoints ?? 0 }),
    createLocation(),
  ]);
  return { challenger, opponent, location };
}

export const FUTURE_DATE = new Date("2030-06-01T18:00:00.000Z");

export async function eventTypes(matchId: string): Promise<string[]> {
  const events = await prisma.matchEvent.findMany({
    where: { matchId },
    // Events written in the same transaction share a timestamp, so id breaks the tie — cuids
    // carry their creation time as a sortable prefix.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return events.map((event) => event.type);
}
