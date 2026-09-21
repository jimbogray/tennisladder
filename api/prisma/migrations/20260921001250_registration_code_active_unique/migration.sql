-- Only *active* (unused) registration codes have to be unique: a code value is free to repeat
-- once an earlier row carrying it has been redeemed. Prisma schema syntax has no WHERE clause for
-- @@unique, so the partial index is hand-written here — see prisma/MIGRATION_NOTES.md.
--
-- registrationCodeService.generateRegistrationCode relies on this: it retries on the unique
-- violation this index raises, and without it a duplicate active code is persisted silently and
-- then redeemed arbitrarily.
--
-- Column names are quoted camelCase: only the table is snake_cased (via @@map), not its columns.
--
-- Expiry (expiresAt) is deliberately not part of the predicate — an expired-but-unused code still
-- occupies its slot until it is redeemed or replaced.
CREATE UNIQUE INDEX "registration_codes_active_code_key"
  ON "registration_codes" ("code")
  WHERE "usedAt" IS NULL;
