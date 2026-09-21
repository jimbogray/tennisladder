/**
 * Preloaded before any test module (see the `test` script in package.json), because
 * `src/config/env.ts` reads the environment once at import time — by the time a test file's
 * imports run it is already too late to redirect the database.
 */
import { resolveTestDatabaseUrl } from "./helpers/databaseUrl.js";

process.env.DATABASE_URL = resolveTestDatabaseUrl();

// Pinned rather than inherited so a developer's api/.env can't change what the tests assert:
// token TTLs and secrets are part of the fixture, not of the machine.
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.JWT_ACCESS_TTL_MINUTES = "15";
process.env.JWT_REFRESH_TTL_DAYS = "30";
process.env.REGISTRATION_CODE_TTL_HOURS = "48";
process.env.WEB_APP_URL = "http://localhost:5173";

// No messaging provider is configured in tests, so email and SMS sends are no-ops that log what
// they would have sent. Set explicitly so the behaviour doesn't depend on NODE_ENV.
process.env.AZURE_COMMUNICATION_CONNECTION_STRING = "";
process.env.LOG_EMAIL_LINKS = "false";
