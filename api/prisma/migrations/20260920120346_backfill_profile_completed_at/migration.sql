-- profileCompletedAt now gates access to the app: it's null only for a Google-first signup that
-- hasn't redeemed an invite code yet. That state can't exist before this migration, so every
-- account already in the table finished signing up under the old rules and has to be marked as
-- such — otherwise everyone is locked out, including DB-provisioned admins with no invite code.
UPDATE "users"
SET "profileCompletedAt" = "createdAt"
WHERE "profileCompletedAt" IS NULL;
