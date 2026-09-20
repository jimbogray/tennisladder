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

- **User**: id, firstName, lastName, email (unique), passwordHash?, googleId? (unique), ustaRating? (Decimal 2,1, nullable — required for Players, null for coach-admins), role (PLAYER|ADMIN), participatesInLadder (Boolean, default true — false for coach-admins; drives ladder visibility and challenge eligibility), points (default 0, unused/always 0 for non-participants), registrationCodeId, emailVerifiedAt?, profileCompletedAt? (for Google-first signups needing USTA rating + code), removedAt? (soft delete when an admin removes the user from the team — the row stays so match history keeps its references; removed users can't sign in and are excluded from the team list, ladder and challenge picker).
- **RegistrationCode**: id, code (6-digit string), createdByAdminId, invitedEmail? (set when issued by email; enforced at redemption, so only that address can use the code), usedAt?, createdAt, expiresAt (createdAt + 48h). Active-code uniqueness enforced via a **raw-SQL partial unique index** (`WHERE used_at IS NULL`) added in a hand-edited migration, since Prisma schema syntax has no `WHERE` clause for `@@unique`. Expiry checked at redemption time, not via the index.
- **Location**: id, name (unique), address?, archivedAt? (soft delete to preserve historical match references), latitude?/longitude?/geocodedAddress? (geocoding cache for the weather forecast and driving times — see below).
- **Match**: id, challengerId, opponentId, status (enum, see below), proposedDateTime (DateTime), proposedLocationId, proposedComment?, awaitingResponseFromUserId, scheduledDateTime?, resultReportedByUserId?, winnerId?, loserId?, pointsAwarded?, resultConfirmedAt?, isAdminOverride, reminderSentAt? / staleResultReminderSentAt? (job idempotency flags).
- **MatchEvent**: id, matchId, type (enum: PROPOSED, COUNTER_PROPOSED, ACCEPTED, DECLINED, RESULT_SUBMITTED, RESULT_CONFIRMED, RESULT_DISPUTED, ADMIN_OVERRIDE_RESULT, ADMIN_CANCELLED), actorUserId?, snapshotDateTime?/snapshotLocationId?/comment? (negotiation events), resultOutcome? (result events), createdAt. Indexed on `(matchId, createdAt)` — **this table is the chronological comment/negotiation thread**, rendered on-site and re-embedded in every notification email.
- **MatchResultToken**: id, matchId, userId, outcome (WON|LOST), token (unique random string), usedAt?. One row per (match, user, outcome) — this is what the "I won"/"I lost" email links resolve against. All unused tokens for a match are voided the moment it reaches COMPLETED.
- **RefreshToken**: id, userId, tokenHash (unique, store hash not raw), expiresAt, revokedAt?.
- **PointsAdjustment**: id, userId, adjustedByAdminId, previousPoints, newPoints, reason? — audit trail for admin manual point overrides.
- **PasswordResetToken**: id, userId, tokenHash (unique), expiresAt, usedAt? — supports the added password-reset flow.
- **UserAddress**: id, userId, label (unique per user, also compared case-insensitively), address, latitude?/longitude?/geocodedAddress? (the same lazy geocoding cache `Location` carries) — places a user travels to matches from (see Saved Addresses below).
- **MatchTravelOrigin**: id, matchId, userId, addressId — which saved address one player is coming from for one match, unique per (match, user).

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

- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/providers` (which sign-in methods are configured), `GET /api/auth/google` (+`/callback`), `POST /api/auth/complete-profile`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/session`, `POST /api/auth/request-password-reset`, `POST /api/auth/reset-password`, `GET /api/auth/verify-email/:token`.
- **Players**: `GET /api/players` (ladder — filters `participatesInLadder=true`), `GET /api/players/me`, `PATCH /api/players/me` (own first/last name only), `GET`/`POST /api/players/me/addresses` and `DELETE /api/players/me/addresses/:id` (own saved addresses only), `PATCH /api/admin/players/:id/points` (Admin). A separate `GET /api/players/challengeable` (or a query param on the same endpoint) returns only `participatesInLadder=true` users for populating the "who to challenge" picker, excluding coach-admins.
- **Registration codes**: `POST /api/admin/registration-codes`, `GET /api/admin/registration-codes` (Admin).
- **Team**: `GET /api/admin/users` (every registered user who hasn't been removed, with email and account type), `PATCH /api/admin/users/:id/account-type`, `DELETE /api/admin/users/:id` (Admin). Removing sets `User.removedAt` rather than deleting the row, and in the same transaction revokes the user's refresh tokens and expires any outstanding password reset links; login, refresh and password reset requests then ignore the account. It's refused for the caller's own account and while the user has unfinished matches (same rule as taking someone off the ladder). An access token the removed user already holds stays valid until it expires (`JWT_ACCESS_TTL_MINUTES`), since `requireAuth` doesn't hit the database; `proposeMatch` checks the challenger's `removedAt` so that window can't be used to open a new match. A removed user's email stays taken, so they can't be re-invited or re-register with it. Account type (Player / Admin / Player and Admin) isn't stored on `User`; it's derived from `role` + `participatesInLadder` and changing it rewrites both, using the same mapping an invite applies. The server refuses to remove the caller's own admin access (which also guarantees an admin always remains) and to take a player off the ladder while they have unfinished matches. Points and `ustaRating` are kept across changes. A new role reaches the affected user's access token on their next refresh.
- **Locations**: `GET /api/locations` (Player/Admin), `POST/PATCH/DELETE /api/admin/locations[/:id]` (Admin, soft delete).
- **Weather**: `GET /api/locations/:id/forecast[?at=<ISO>]` (Player/Admin) — a 7-day outlook, or with `at` the hours around a match time. Shown on the propose/amend/counter forms.
- **Travel**: `GET /api/matches/:id/travel-plan` (the caller's own journey only) — when to leave for a scheduled match, shown on the match page. `GET /api/travel/departure?addressId=&locationId=&at=` answers the same question for a match that doesn't exist yet, from one of the caller's own saved addresses — shown on the propose/amend/counter forms.
- **Matches**: `GET /api/matches?filter=all|completed|pending`, `POST /api/matches` (propose — server rejects if either challenger or opponent has `participatesInLadder=false`), `GET /api/matches/:id`, `GET /api/matches/mine`, `POST /api/matches/:id/{counter,accept,decline}`, `PUT /api/matches/:id/travel-origin` (the caller's own, upcoming matches only), `GET /api/matches/:id/travel-plan` (the caller's own departure time), `GET /api/admin/matches/pending` (Admin).
- **Results**: `POST /api/matches/:id/result` (web), `GET`/`POST /api/results/token/:token` (public — token is the credential), `POST /api/admin/matches/:id/override-result` (Admin).

## Weather Forecast

The match proposal forms show the forecast for the chosen location: a 7-day outlook, narrowing to the hours around the match (2 before, 3 after) once a date and time are picked.

- **Providers** — both free and keyless, called server-side from `api/src/services/weatherService.ts` (geocoding via the shared `geocodingService.ts`, HTTP via `upstream.ts`), so the SPA never depends on their response shapes. Forecasts come from **Open-Meteo** (16-day horizon; the free tier is licensed for non-commercial use and requires the attribution link the UI shows — commercial use needs their paid API). Addresses are geocoded with OpenStreetMap's **Nominatim**, whose usage policy requires an identifying User-Agent, at most one request per second, and caching of results.
- **Geocoding is lazy and persisted.** Location addresses are free text, so coordinates are looked up on the first forecast request and stored on the Location along with `geocodedAddress`, the address they came from. An edited address no longer matches and is looked up again; an address that can't be found is stored with null coordinates so it isn't retried on every request. Google-formatted addresses often name streets OSM doesn't know, so a miss retries with leading comma-separated parts dropped — town-level precision is plenty for both weather and a driving estimate. `UserAddress` carries the same three columns and goes through the same `geocodingService.ts` helpers.
- **Forecast responses are cached in memory for 30 minutes per location**, which relies on the same single-replica assumption as the scheduled jobs (a second replica would only mean more upstream calls, not incorrect data).
- Units are always metric in the API; the SPA converts to °F/mph for US-region locales.

## Google Sign-In

Offered on the login and register pages, alongside the email/password form. Hand-rolled against
Google's OAuth 2.0 endpoints rather than through a provider library, for the same reason the rest
of auth is hand-rolled — see the risk flag above.

- **Flow.** `GET /api/auth/google` redirects to Google's consent screen with a random `state`,
  which is also set as a short-lived httpOnly cookie on the API's own origin; the callback refuses
  anything whose `state` doesn't match, which is what stops a third party's authorization code
  being fed to us. No PKCE: this is a confidential client, so the code is useless without the
  secret, which never leaves the server.
- **Profile comes from the userinfo endpoint**, not from decoding the `id_token`, so there is no
  unverified JWT handling anywhere — the answer arrives straight from Google over TLS.
- **Unverified Google emails are rejected**, or signing up to Google with a club member's address
  would be enough to claim their account.
- **The callback ends in a redirect, not a response body.** There is no SPA code waiting on it at
  that point, so the session is handed over as the refresh cookie alone and the SPA mints an
  access token from it on load — the same path it already takes after a full page reload.
- **Merging is by email** (TL-7): an existing account with the same address adopts the Google id
  and keeps its password, so either way in works afterwards.
- **A Google-first signup still needs an invite code.** It gets a `User` row with no
  `registrationCodeId` and `profileCompletedAt` null, and is sent to `/complete-profile` to redeem
  one, which is what decides its account type. Until then `profileComplete: false` rides in the
  access token and `requireAuth` answers 403 `PROFILE_INCOMPLETE` everywhere except session,
  logout and complete-profile; the ladder, challenge picker and team list exclude it as well. The
  claim lives in the token so the guard costs no database round trip, and a missing claim reads as
  complete, so tokens minted before the feature shipped keep working.
- **Configuration is optional.** Without `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` the endpoints
  redirect back with a message and `GET /api/auth/providers` reports `google: false`, which is how
  the SPA knows to hide the button. Local dev and staging run this way.

## Saved Addresses

Users save labelled addresses (Home, Office, or a custom label) at registration or on their profile, using the same Places autocomplete as the Locations page. When proposing, amending, countering or accepting a match, and later on a scheduled match, a player can pick which one they're coming from. Once the match is scheduled, that choice drives the departure time (see Driving Times below).

- **Private to the user.** Addresses are only reachable through `/players/me/addresses`, and a match's travel origin comes back only as `myTravelOrigin` on `GET /api/matches/:id`, always for the requesting user. Admins can't see either.
- **Origins live in `MatchTravelOrigin`, not on `Match`.** Match rows are returned whole to both players and in the public match lists, so a column there would leak. For the same reason, choosing an origin writes no `MatchEvent`: the event thread is shown to both players and embedded in emails.
- **Request semantics.** The propose, amend, counter and accept bodies take an optional `travelOriginAddressId`. If it's omitted, the current choice stays; `null` clears it; an id must belong to the caller. The SPA omits it while addresses are still loading, so a fast submit can't clear an earlier choice.
- **Addresses are referenced, not copied.** Deleting an address cascades to the origins that used it, and with it the departure time worked out from it.

## Driving Times

A scheduled match's page tells each player when to leave to arrive before it starts, and the
propose/amend/counter forms answer the same question for the slot being drafted, so a player can
see what a time or a set of courts would cost them before offering it
(`api/src/services/travelService.ts`; `GET /api/matches/:id/travel-plan` and
`GET /api/travel/departure`, which share one `planJourney` core).

- **Departure is rounded *down* to a quarter hour.** The routing engine works in free-flowing road
  speeds with no live traffic, so the discarded minutes are the slack that makes "arrive before the
  start" hold up. Flooring the instant lands on a local quarter hour too: every timezone offset in
  use is a whole number of quarter hours, the same assumption the 15-minute match grid relies on.
- **Routing is OSRM**, free and keyless like the weather providers, defaulting to the project's
  public demo server and overridable with `ROUTING_BASE_URL` for a self-hosted instance. Durations
  are cached in memory for 6 hours per rounded coordinate pair — road distances don't change, and
  the one thing that does (traffic) isn't modelled anyway.
- **Both ends are geocoded lazily**, the player's saved address exactly like the location
  (see Weather Forecast above), so a departure time costs no upstream calls once both are cached.
- **A drive over 8 hours is reported as `TOO_FAR`, not as a departure time.** A club ladder's
  matches are local, so a journey that long means an address landed on the wrong continent rather
  than that anyone is really driving it — a location addressed "Flushing Meadows" geocodes to a
  housing development of that name in Bangalore. The forecast has the same exposure and no such
  guard; it just shows the wrong city's weather.
- **Private, and scheduled matches only.** The endpoint answers only for the requesting player and
  only from their own travel origin — a departure time reveals roughly where someone lives, so a
  non-participant gets the same 404 as for a match that doesn't exist. Before a match is agreed
  there's no time to arrive by, so the match endpoint reports `NOT_SCHEDULED` rather than guessing
  from a proposal that can still move — the draft on a proposal form asks `/api/travel/departure`
  with the time it's actually offering instead, and that endpoint answers only for addresses that
  belong to the caller (anyone else's is a 404, never a named address).
- **Every "no departure time" case is a named status**, not an error: no origin chosen, no address
  on the location, either end unfindable, or no road route between them. Only an upstream failure
  is a 502, which the SPA renders as "unavailable right now" rather than a broken page.

## React App Structure

Routes (`react-router-dom`): `/login`, `/signup`, `/complete-profile`, `/ladder`, `/matches` (+ `/matches/new`, `/matches/:id`), `/negotiations`, `/admin/negotiations`, `/locations`, `/profile`, `/admin/players`, `/admin/team`, `/admin/registration-codes`, `/forgot-password`, `/reset-password/:token`, `/verify-email/:token`, `/results/confirm/:token` (public — token is the credential), all others behind `RequireAuth`/`RequireAdmin` guards fed by an `AuthContext` populated from `GET /api/auth/session`.

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
- Registration codes generated for manual handout are generic (anyone holding the code can
  redeem it); a code issued by emailing an invite carries `invitedEmail` and only that
  address can redeem it.
- Coach-admin accounts can be created from an Admin or Player-and-Admin invite, and an existing user's account type can be changed on the admin Team page (`/admin/team`); `scripts/create-admin.ts` remains the bootstrap path for the first admin.

## Verification

1. `npm install` at the repo root resolves all three workspaces.
2. `npm run build --workspace=api` and `--workspace=web` both succeed (type-checks cleanly, no runtime logic to exercise yet).
3. `npx prisma migrate dev` against a local Postgres (e.g. `docker run postgres`) applies the schema cleanly, including the hand-added partial unique index migration for active registration codes.
4. `npm run dev` in `/api` boots Express and responds on a health-check route (e.g. `GET /api/health`); `npm run dev` in `/web` boots Vite and loads the login page.
5. Manual smoke check once auth is filled in: register a user with a valid code, confirm ladder/locations/matches pages route correctly behind `RequireAuth`.
