# Tennis Ladder — Architecture Design & Initial Scaffold

## Context

The repo currently contains only a README — this is a greenfield build. The attached spec describes a club tennis ladder app covering auth/onboarding, a match proposal/negotiation/counter-propose engine, tokenized email + web result confirmation, ranking math, and four core screens (Ladder, Scheduled Match, Pending Match, Locations). The goal of this pass is to (1) lock in an architecture and data model that satisfies every requirement in the spec, and (2) scaffold the initial project structure (folders, configs, stubs) so implementation can start immediately without re-deriving structure decisions.

**Decisions confirmed with the user:**
- Architecture: separate **React (Vite) SPA** + standalone **Express/Node API** (not a Next.js monolith) — two deployables.
- Auth library: **Auth.js** core via `@auth/express`, Google + Credentials providers.
- Email: **Azure Communication Services** (outbound transactional only).
- Hosting: **Azure Container Apps** (API) + **Azure Static Web Apps** (SPA, static-only, no linked Functions).
- ORM: **Prisma** / **PostgreSQL**.
- Scheduled Match screen requires login (Player/Admin) — resolves the spec's "all users" vs. Anonymous-role contradiction in favor of the role model.
- Password reset + email verification are **in scope** for this design, even though not explicit in the spec, since they're necessary for a real username/password flow.
- **Coach/non-player admin support** (added requirement): some Admins are coaches who need full admin privileges but must never appear in the ladder, never be challengeable, and never participate in matches. Modeled as a `participatesInLadder: Boolean` flag on `User`, orthogonal to `role` (PLAYER|ADMIN stays a two-value permission enum — no third role value, so a future "player who opts out of the ladder" case is already covered by the same flag rather than requiring another role). Coach-admin accounts are **DB-provisioned only** (same out-of-band path the spec already defines for regular Admins — no self-signup UI for this rare, low-volume role), and `ustaRating` is **nullable** on `User` (required for Players, left null for coach-admins since it's a player-only concept).
- Scope of this pass: design doc + scaffold (folder structure, package.jsons, Prisma schema, env templates, skeleton Express app with route stubs, skeleton React app with routed pages/component stubs) — not full feature implementation.

## Key Risk Flag: Auth.js + Credentials + cross-origin SPA

Auth.js does not support DB session strategy together with the Credentials provider, so **session strategy is JWT**, hand-rolled against our own `User` table (no `@auth/prisma-adapter`, no Account/Session/VerificationToken tables). Because the SPA (Static Web Apps) and API (Container Apps) sit on different default Azure domains, a single shared cookie won't work without custom subdomains. Default: **short-lived JWT access token in the response body (held in memory on the SPA, sent as `Authorization: Bearer`)** + **long-lived refresh token in an httpOnly cookie scoped to the API's own origin**, refreshed via `POST /api/auth/refresh`. If `@auth/express` proves awkward for this shape in practice, fall back to **Passport.js** (`passport-local` + `passport-google-oauth20`) + `express-session` — isolated to `/api/src/auth/*`, same `User` table either way.

## Monorepo Layout

```
/tennisladder
  package.json                # npm workspaces root
  tsconfig.base.json
  /packages/shared             # hand-maintained enums + shared DTO types only
  /api                         # Express API
  /web                         # React (Vite) SPA
```

npm workspaces (not pnpm) — no extra tooling to install locally.

## Database Schema (Prisma) — core models

- **User**: id, firstName, lastName, email (unique), passwordHash?, googleId? (unique), ustaRating? (Decimal 2,1, nullable — required for Players, null for coach-admins), role (PLAYER|ADMIN), participatesInLadder (Boolean, default true — false for coach-admins; drives ladder visibility and challenge eligibility), points (default 0, unused/always 0 for non-participants), registrationCodeId, emailVerifiedAt?, profileCompletedAt? (for Google-first signups needing USTA rating + code).
- **RegistrationCode**: id, code (4-digit string), createdByAdminId, usedAt?, createdAt, expiresAt (createdAt + 48h). Active-code uniqueness enforced via a **raw-SQL partial unique index** (`WHERE used_at IS NULL`) added in a hand-edited migration, since Prisma schema syntax has no `WHERE` clause for `@@unique`. Expiry checked at redemption time, not via the index.
- **Location**: id, name (unique), archivedAt? (soft delete to preserve historical match references).
- **Match**: id, challengerId, opponentId, status (enum, see below), proposedDateTime (DateTime), proposedLocationId, proposedComment?, awaitingResponseFromUserId, scheduledDateTime?, resultReportedByUserId?, winnerId?, loserId?, pointsAwarded?, resultConfirmedAt?, isAdminOverride, reminderSentAt? / staleResultReminderSentAt? (job idempotency flags).
- **MatchEvent**: id, matchId, type (enum: PROPOSED, COUNTER_PROPOSED, ACCEPTED, DECLINED, RESULT_SUBMITTED, RESULT_CONFIRMED, RESULT_DISPUTED, ADMIN_OVERRIDE_RESULT, ADMIN_CANCELLED), actorUserId?, snapshotDateTime?/snapshotLocationId?/comment? (negotiation events), resultOutcome? (result events), createdAt. Indexed on `(matchId, createdAt)` — **this table is the chronological comment/negotiation thread**, rendered on-site and re-embedded in every notification email.
- **MatchResultToken**: id, matchId, userId, outcome (WON|LOST), token (unique random string), usedAt?. One row per (match, user, outcome) — this is what the "I won"/"I lost" email links resolve against. All unused tokens for a match are voided the moment it reaches COMPLETED.
- **RefreshToken**: id, userId, tokenHash (unique, store hash not raw), expiresAt, revokedAt?.
- **PointsAdjustment**: id, userId, adjustedByAdminId, previousPoints, newPoints, reason? — audit trail for admin manual point overrides.
- **PasswordResetToken**: id, userId, tokenHash (unique), expiresAt, usedAt? — supports the added password-reset flow.

## Match State Machine

| From | Event | To |
|---|---|---|
| — | Propose challenge | `NEGOTIATING` (email to opponent) |
| `NEGOTIATING` | Accept | `SCHEDULED` (snapshot scheduledDateTime, confirmation emails, generate 4 result tokens) |
| `NEGOTIATING` | Decline | `DECLINED` (terminal) |
| `NEGOTIATING` | Counter-propose | `NEGOTIATING` (flips `awaitingResponseFromUserId`, loops indefinitely) |
| `SCHEDULED` | Either player submits result (web or token) | `RESULT_PENDING` |
| `RESULT_PENDING` | Second player submits matching result | `COMPLETED` (points applied transactionally, tokens voided) |
| `RESULT_PENDING` | Second player submits conflicting result | `RESULT_DISPUTED` (surfaces on admin dashboard) |
| any pre-`COMPLETED` state | Admin overrides | `COMPLETED` (`isAdminOverride=true`, bypasses confirmation) |

**Points math**, applied once at transition into `COMPLETED`, inside a transaction with rows locked in a consistent order (by `id`) to avoid deadlocks:
```
if winner.points < loser.points:  winner.points = loser.points + 1   # upset
else:                              winner.points = winner.points + 1  # standard win
loser.points unchanged
```

## Scheduled Jobs

In-process **`node-cron`**, polling every minute, on the always-on Express/Container Apps process (`minReplicas=maxReplicas=1` for V1 to avoid duplicate sends; job idempotency flags make double-fires harmless anyway). Migrate to Azure Functions Timer Triggers later if horizontal scaling is needed.

1. **1-hour-before reminder**: `status=SCHEDULED`, `scheduledDateTime` within next hour, `reminderSentAt IS NULL`.
2. **24-hours-after stale result reminder**: `status IN (SCHEDULED, RESULT_PENDING)`, `scheduledDateTime` >24h ago, `staleResultReminderSentAt IS NULL`.
3. Registration code expiry needs no job — computed at read time from `expiresAt`.

## API Endpoints (grouped)

- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/google` (+`/callback`), `POST /api/auth/complete-profile`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/session`, `POST /api/auth/request-password-reset`, `POST /api/auth/reset-password`, `GET /api/auth/verify-email/:token`.
- **Players**: `GET /api/players` (ladder — filters `participatesInLadder=true`), `GET /api/players/me`, `PATCH /api/admin/players/:id/points` (Admin). A separate `GET /api/players/challengeable` (or a query param on the same endpoint) returns only `participatesInLadder=true` users for populating the "who to challenge" picker, excluding coach-admins.
- **Registration codes**: `POST /api/admin/registration-codes`, `GET /api/admin/registration-codes` (Admin).
- **Locations**: `GET /api/locations` (Player/Admin), `POST/PATCH/DELETE /api/admin/locations[/:id]` (Admin, soft delete).
- **Matches**: `GET /api/matches?filter=all|completed|pending`, `POST /api/matches` (propose — server rejects if either challenger or opponent has `participatesInLadder=false`), `GET /api/matches/:id`, `GET /api/matches/mine`, `POST /api/matches/:id/{counter,accept,decline}`, `GET /api/admin/matches/pending` (Admin).
- **Results**: `POST /api/matches/:id/result` (web), `GET`/`POST /api/results/token/:token` (public — token is the credential), `POST /api/admin/matches/:id/override-result` (Admin).

## React App Structure

Routes (`react-router-dom`): `/login`, `/signup`, `/complete-profile`, `/ladder`, `/matches` (+ `/matches/new`, `/matches/:id`), `/negotiations`, `/admin/negotiations`, `/locations`, `/admin/players`, `/admin/registration-codes`, `/reset-password/:token`, `/verify-email/:token`, `/results/confirm/:token` (public — token is the credential), all others behind `RequireAuth`/`RequireAdmin` guards fed by an `AuthContext` populated from `GET /api/auth/session`.

Shared components: `CommentThread`, `FilterToggleBar`, `LadderTable`, `NegotiationActions`, `LocationPicker`, `OpponentPicker` (sources `/api/players/challengeable`, excludes coach-admins), `MatchStatusBadge`, `RequireAuth`/`RequireAdmin`. Server state via TanStack Query; thin typed API client modules under `src/api/`.

## Scaffold (this pass)

```
/tennisladder/package.json, tsconfig.base.json, .gitignore, docs/architecture.md
/packages/shared/{package.json, src/enums.ts, src/apiTypes.ts}

/api/package.json, tsconfig.json, .env.example
/api/prisma/schema.prisma
/api/src/index.ts, app.ts
/api/src/config/{env.ts, prisma.ts}
/api/src/auth/{authConfig.ts, passwordUtils.ts, middleware.ts}
/api/src/routes/{index,auth,players,locations,matches,results,admin}.routes.ts
/api/src/controllers/*.controller.ts   (stub handlers, one per resource)
/api/src/services/{matchService,emailService,tokenService,registrationCodeService}.ts
/api/src/jobs/{scheduler,matchReminderJob,staleResultReminderJob}.ts
/api/src/emails/templates/*.ts         (challengeProposed, matchConfirmed, matchReminder, resultStale, resultFinalized, passwordReset, verifyEmail)
/api/src/middleware/errorHandler.ts

/web/package.json, vite.config.ts, tsconfig.json, index.html, .env.example
/web/src/main.tsx, App.tsx
/web/src/pages/*.tsx                   (one per route above)
/web/src/components/*.tsx              (per shared component list)
/web/src/context/AuthContext.tsx
/web/src/api/client.ts, {auth,players,locations,matches,results,admin}.ts
/web/src/hooks/useAuth.ts
```

Prisma models and route/controller/service files land as typed stubs (correct signatures, `TODO` bodies or minimal pass-through), not full business logic — this pass makes the shape of the app concrete and buildable (`npm install && npm run build` should succeed) so feature logic can be filled in incrementally next.

## Open assumptions carried forward (defaults chosen, reversible)

- Re-challenge after Decline: allowed immediately, new `Match` row, no cooldown.
- Concurrent negotiations between the same pair: no DB-level limit in V1.
- Reschedule after `SCHEDULED`: unsupported in V1 (no reschedule path).
- Result-token expiry: none — single-use only, voided on match completion.
- Admin notified on dispute: no extra email, surfaces on existing dashboard.
- Registration codes are generic (not bound to a specific invitee's email).
- Coach-admin accounts are created exclusively by direct DB/config provisioning (same as the spec's existing Admin-provisioning path) — no in-app UI to create or promote a user to coach-admin in V1.

## Verification

1. `npm install` at the repo root resolves all three workspaces.
2. `npm run build --workspace=api` and `--workspace=web` both succeed (type-checks cleanly, no runtime logic to exercise yet).
3. `npx prisma migrate dev` against a local Postgres (e.g. `docker run postgres`) applies the schema cleanly, including the hand-added partial unique index migration for active registration codes.
4. `npm run dev` in `/api` boots Express and responds on a health-check route (e.g. `GET /api/health`); `npm run dev` in `/web` boots Vite and loads the login page.
5. Manual smoke check once auth is filled in: register a user with a valid code, confirm ladder/locations/matches pages route correctly behind `RequireAuth`.
