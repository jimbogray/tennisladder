import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/passwordUtils.js";

const prisma = new PrismaClient();

async function main() {
  const email = "jimbogray@gmail.com";
  const passwordHash = await hashPassword("pass123");

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "ADMIN",
      participatesInLadder: false,
      emailVerifiedAt: new Date(),
      profileCompletedAt: new Date(),
    },
    create: {
      firstName: "Admin",
      lastName: "User",
      email,
      passwordHash,
      role: "ADMIN",
      participatesInLadder: false,
      emailVerifiedAt: new Date(),
      profileCompletedAt: new Date(),
    },
  });

  console.log(`Admin user ready: ${user.email} (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
