/**
 * Gets the test database ready. Run by the `pretest` script, so `npm test` never runs against a
 * stale schema or a Prisma client that predates the last migration — the two failures that
 * otherwise show up as a wall of unrelated assertion errors.
 */
import { spawnSync } from "node:child_process";
import { resolveTestDatabaseUrl } from "./helpers/databaseUrl.js";

const env = { ...process.env, DATABASE_URL: resolveTestDatabaseUrl() };

function prisma(args: string[]): number {
  const result = spawnSync("npx", ["prisma", ...args], {
    stdio: "inherit",
    env,
    // npx resolves through the shell's PATH on Windows runners too.
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (prisma(["generate"]) !== 0) process.exit(1);

if (prisma(["migrate", "deploy"]) !== 0) {
  console.error(
    `\nCould not migrate the test database. It has to exist before the suite runs:\n` +
      `  createdb tennisladder_test\n` +
      `or point TEST_DATABASE_URL at a database whose name ends in "_test".\n`,
  );
  process.exit(1);
}
