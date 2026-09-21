# Hand-written migrations

Migrations that Prisma can't generate from `schema.prisma` and that therefore have to be written
by hand. They are already applied — this file records *why* they exist, so a later
`prisma migrate diff` or a schema rewrite doesn't quietly drop them.

## `registration_code_active_unique`

Only *active* (unused) registration codes have to be unique: once a code has been redeemed its
value is free to be handed out again. Prisma schema syntax has no `WHERE` clause for `@@unique`,
so the partial index is hand-written:

```sql
CREATE UNIQUE INDEX "registration_codes_active_code_key"
  ON "registration_codes" ("code")
  WHERE "usedAt" IS NULL;
```

Note the column is quoted camelCase `"usedAt"` — only the *table* is snake_cased, via `@@map`.

`registrationCodeService.generateRegistrationCode` depends on this index: it retries on the
unique violation the index raises. Without it a duplicate active code is persisted silently and
then redeemed arbitrarily, which can hand a registrant the `accountType` of a colliding invite.

Expiry (`expiresAt`) is deliberately not part of the predicate — it's enforced at redemption time
in `registrationCodeService`, and an expired-but-unused code still occupies its unique slot until
it is redeemed or replaced.

Because the index is invisible to `schema.prisma`, `prisma migrate dev` will not recreate it if
the migration history is ever squashed or reset. Re-apply it by hand if that happens.
