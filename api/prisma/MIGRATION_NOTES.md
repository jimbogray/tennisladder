After the first `npx prisma migrate dev --name init`, hand-add a partial unique index so only
*active* (unused) registration codes must be unique — Prisma schema syntax has no `WHERE` clause
for `@@unique`. Create a follow-up migration (`npx prisma migrate dev --create-only --name registration_code_active_unique`)
and set its `migration.sql` to:

```sql
CREATE UNIQUE INDEX registration_codes_active_code_key
  ON registration_codes (code)
  WHERE used_at IS NULL;
```

Expiry (`expiresAt`) is enforced at redemption time in `registrationCodeService`, not by this index —
an expired-but-unused code still occupies its unique slot until redeemed or replaced.
