/**
 * Where the tests point Postgres.
 *
 * The suite truncates every table between tests, so it must never be aimed at a database anyone
 * cares about. `TEST_DATABASE_URL` is the explicit way to say which database that is; without it
 * the default below is used, and a `DATABASE_URL` left over in `api/.env` is deliberately *not*
 * consulted — that one is the development database, and wiping it would be the obvious accident.
 *
 * The `_test` suffix is then enforced as a second line of defence, so pointing TEST_DATABASE_URL
 * at the wrong database fails loudly instead of quietly emptying it.
 */
const DEFAULT_TEST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/tennisladder_test?schema=public";

export function resolveTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL?.trim() || DEFAULT_TEST_DATABASE_URL;

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    throw new Error(`TEST_DATABASE_URL is not a valid connection URL: ${url}`);
  }

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run the test suite against "${databaseName}": the tests truncate every table, ` +
        `so the database name must end in "_test". Set TEST_DATABASE_URL accordingly.`,
    );
  }

  return url;
}
