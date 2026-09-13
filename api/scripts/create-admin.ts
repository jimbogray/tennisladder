/**
 * Creates an admin account, or promotes an existing account to admin.
 *
 * Bootstraps a fresh environment: registering needs an invite code, and only an admin can issue
 * one. Credentials come from the environment, never from this file — it runs against hosted
 * databases, so nothing here may be a usable default.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npx tsx scripts/create-admin.ts
 *
 * For a hosted environment use ../../infra/create-admin.sh, which supplies DATABASE_URL and opens
 * the database firewall for the duration.
 *
 * Environment:
 *   ADMIN_EMAIL        required
 *   ADMIN_PASSWORD     required, at least 12 characters
 *   ADMIN_FIRST_NAME   optional, default "Admin"   (used only when creating)
 *   ADMIN_LAST_NAME    optional, default "User"    (used only when creating)
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/passwordUtils.js";

const MIN_PASSWORD_LENGTH = 12;

// Distinct exit code for "database unreachable", so infra/create-admin.sh can retry that — a new
// firewall rule takes a few seconds to apply — without retrying failures that won't fix themselves.
const EXIT_UNREACHABLE = 3;

function fail(message: string, code = 1): never {
  console.error(`error: ${message}`);
  process.exit(code);
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !email.includes("@")) fail("ADMIN_EMAIL must be set to an email address");
if (!password) fail("ADMIN_PASSWORD must be set");
if (password.length < MIN_PASSWORD_LENGTH) {
  fail(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
}
if (!process.env.DATABASE_URL) fail("DATABASE_URL must be set");

const prisma = new PrismaClient();

async function main() {
  // Connect explicitly: a lazy connection on the first query reports failures without an errorCode,
  // which the retry logic below depends on.
  await prisma.$connect();
  const passwordHash = await hashPassword(password!);
  const existing = await prisma.user.findUnique({ where: { email: email! } });

  if (existing) {
    // Promote in place. participatesInLadder is left alone: promoting a player who's on the
    // ladder must not quietly remove them from it.
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN", passwordHash },
    });
    console.log(
      `Promoted existing account ${email} to admin and reset its password ` +
        `(on ladder: ${existing.participatesInLadder ? "yes" : "no"}).`,
    );
    return;
  }

  // A brand-new admin is a coach-admin: full admin rights, but not a ladder player, which is why
  // no USTA rating is needed. To be an admin who also plays, register normally and then run this
  // script against that email instead.
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email: email!,
      passwordHash,
      firstName: process.env.ADMIN_FIRST_NAME?.trim() || "Admin",
      lastName: process.env.ADMIN_LAST_NAME?.trim() || "User",
      role: "ADMIN",
      participatesInLadder: false,
      emailVerifiedAt: now,
      profileCompletedAt: now,
    },
  });
  console.log(`Created admin ${user.email} (not on the ladder).`);
}

main()
  .catch((err: unknown) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
      fail("the users table doesn't exist — deploy this environment first so migrations are applied");
    }
    if (err instanceof Prisma.PrismaClientInitializationError) {
      // P1001 can't reach the server, P1017 server closed the connection: both are what a firewall
      // rule that hasn't applied yet looks like. Anything else (e.g. P1000 bad credentials) is final.
      const unreachable = err.errorCode === "P1001" || err.errorCode === "P1017";
      fail(
        `couldn't connect to the database (${err.errorCode ?? "unknown"}): ${err.message.split("\n")[0]}`,
        unreachable ? EXIT_UNREACHABLE : 1,
      );
    }
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
