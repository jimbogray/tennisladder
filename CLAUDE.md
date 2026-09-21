# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A club tennis ladder app: auth/onboarding, a match challenge/negotiation/counter-propose engine,
tokenized email + web result confirmation, ranking math, and admin tooling (players, locations,
registration codes). Full design rationale, data model, state machine, and API surface are in
[docs/architecture.md](docs/architecture.md) — read it before making structural changes; it
documents *why* things are shaped the way they are, not just what exists.

## Commands

npm workspaces monorepo — always run installs/scripts from the repo root unless noted.

**Node 22 only.** `.nvmrc` is the source of truth: CI and deploy workflows read it via
`node-version-file`, and `api/Dockerfile` hard-codes the same major. The root `engines` field plus
`engine-strict=true` in `.npmrc` make `npm install` fail on any other major. That's deliberate:
the npm bundled with newer Node skips dependency install scripts (Prisma, esbuild) unless approved,
and has rewritten `package.json` ranges during a routine `npm install <pkg>`. When bumping Node,
change `.nvmrc`, `engines`, `@types/node` and both Dockerfile `FROM` lines together.

```bash
npm install                        # resolves all three workspaces; postinstall builds @tennisladder/shared
npm run dev:api                    # tsx watch, http://localhost:4000
npm run dev:web                    # vite, http://localhost:5173
npm run build                      # builds shared -> api -> web in order (shared must build first)
npm run lint                       # tsc --noEmit for api, its tests, and web (no eslint configured)
npm test                           # api test suite (node --test); needs a local Postgres, see Tests
```

Per-workspace (from `api/` or `web/`):
```bash
npm run dev                        # tsx watch src/index.ts (api)  /  vite (web)
npx tsc -p tsconfig.json --noEmit  # typecheck a single workspace directly
```

Prisma (from `api/`):
```bash
npm run prisma:generate            # regenerate the Prisma client after schema changes
npm run prisma:migrate             # prisma migrate dev
ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx scripts/create-admin.ts  # create an admin or promote an existing account
```

For hosted environments, use `./infra/create-admin.sh <staging|production>` from the repo root. It
supplies `DATABASE_URL` and temporarily opens the database firewall.

### Tests

```bash
npm test                           # api suite; also runnable from api/ as npm test
```

A deliberately small `node --test` suite (no test framework dependency — `tsx` supplies the TS
loader) over the four areas where types can't help: the match state machine, the points formula,
auth, and registration codes. It runs in CI and a failure fails the build. It is a baseline to
add to when a bug is found, not a coverage target — the rest of the app is still verified by
hand.

Tests live in `api/test/`, outside `rootDir`, so they never reach `dist/` or the container image;
`api/tsconfig.test.json` is what typechecks them, and `npm run lint` runs it.

**They need a real PostgreSQL**, because the invariants worth testing (points applied inside the
completing transaction, the partial unique index on active registration codes, `MatchEvent`
written alongside every `Match` status change) only exist in the database:

```bash
createdb tennisladder_test         # once; or set TEST_DATABASE_URL at a database of your own
```

`TEST_DATABASE_URL` defaults to `postgresql://postgres:postgres@localhost:5432/tennisladder_test`
and is deliberately *not* read from `DATABASE_URL` — the suite truncates every table between
tests, and a name that doesn't end in `_test` is refused outright, so a dev database can't be
wiped by accident. `pretest` runs `prisma generate` and `prisma migrate deploy` against it.

Test files run one at a time (`--test-concurrency=1`) since they share that one database. The
rate limiters are process-wide singletons, so HTTP tests go through `apiClient()` in
`test/helpers/http.js`, which gives each caller its own `X-Forwarded-For` and cookie jar.

**No ESLint** — `lint` scripts run `tsc --noEmit` over the app and the tests. Between that and the
suite above, anything else still needs checking by hand.

### Local environment

- Requires a local PostgreSQL instance; `api/.env` needs `DATABASE_URL` (copy from `api/.env.example`).
- `web/.env` is **not** committed (gitignored) and doesn't ship by default — copy `web/.env.example`
  to `web/.env` (sets `VITE_API_BASE_URL`) or the SPA's API calls silently target `undefined` and
  every request 404s. Vite only reads `.env` at server start, so restart `npm run dev:web` after
  creating/editing it.
- `EMAIL_REDIRECT_TO` (optional, `api/.env`) sends every outbound email to one address instead of
  the player it was addressed to, with that player named at the front of the subject. It's how
  notifications get tested in dev and staging without mailing real members; the body, and so every
  link in it, is left exactly as rendered. Production must leave it blank.
- `VITE_GOOGLE_MAPS_API_KEY` (optional) drives Places autocomplete + embedded maps on the Locations
  page. Left blank, the address field degrades to a plain text input and maps are hidden, so the
  page stays fully usable — a blank key is a supported state, not a broken one.
- CORS + cookies: the API only accepts credentialed requests from `WEB_APP_URL` (`api/.env`), and
  the SPA calls `VITE_API_BASE_URL` (`web/.env`) — both must point at each other's actual
  origin/port or auth breaks silently.

## Architecture

### Monorepo layout

```
/packages/shared   @tennisladder/shared — hand-maintained enums + DTO types shared by api and web.
                   Must be built (npm run build --workspace=@tennisladder/shared) before api/web
                   typecheck, since they import it as a real package, not a path alias. Root
                   postinstall does this automatically; after pulling schema/enum changes, rebuild
                   it manually if types look stale.
/api               Express API (ESM, "type": "module" — all relative imports use .js extensions
                   even in .ts source).
/web               React (Vite) SPA.
```

Enums in `packages/shared/src/enums.ts` are `as const` objects + derived union types (not TS
`enum`), so they serialize identically to the Prisma-generated string enums they mirror. DTOs in
`apiTypes.ts` are hand-kept in sync with `api/prisma/schema.prisma` — there's no codegen step
linking them, so a Prisma model change needs a matching manual DTO update.

### Auth model (session strategy is JWT, not DB sessions)

No `@auth/prisma-adapter` — auth is hand-rolled against the `User` table directly, because
Auth.js can't combine a DB session strategy with a Credentials provider.

Hosted environments put the SPA (Static Web Apps) and API (Container Apps) on separate origins
that are the **same site**, which is load-bearing: the refresh cookie is `sameSite: "lax"` and is
only sent because both hosts share the registrable domain `playmore.tennis` —
`staging.` + `api.staging.` for staging, `www.` + `api.` for production. Serving either from
Azure's default `*.azurestaticapps.net` / `*.azurecontainerapps.io` hostnames would make it a
third-party cookie, which Safari blocks.

### Environments and deployment

Local (laptop Postgres) → staging (auto-deployed on merge to `main`) → production (manual
promotion via `deploy-production.yml`, which only accepts commits that passed staging). Each hosted
environment has its own database, resource group, JWT secrets and least-privilege deploy identity;
staging deliberately has no email configured. The API image is built once and promoted unchanged,
but the SPA is rebuilt per environment because Vite bakes `VITE_API_BASE_URL` in at build time.
Azure resources are provisioned with the idempotent scripts in `infra/` (all support `DRY_RUN=1`);
see `docs/deployment.md` before changing any of it.

- **Access token**: short-lived JWT, returned in the response body, held in memory only on the
  client (`web/src/api/client.ts`), sent as `Authorization: Bearer`. Never persisted to
  localStorage/sessionStorage — it's expected to be re-minted, not stored.
- **Refresh token**: long-lived JWT in an httpOnly cookie scoped to `/api/auth` on the API's own
  origin. `POST /api/auth/refresh` verifies it against both the JWT signature and a
  `refresh_tokens` DB row (`revokedAt`/`expiresAt`), then mints a new access token. It is
  intentionally **non-rotating** (doesn't invalidate the refresh token on each use) — rotation was
  tried and caused legitimate concurrent refresh calls (e.g. React StrictMode's double effect
  invocation in dev) to race each other into spurious 401s.
- Every refresh/access token carries a `jti`/random component — without it, two tokens minted for
  the same user in the same second are byte-identical JWTs and collide on the
  `refresh_tokens.tokenHash` unique constraint.
- `web/src/context/AuthContext.tsx` calls `POST /api/auth/refresh` on mount (not
  `GET /api/auth/session`, which requires an access token the client won't have yet after a
  reload) to recover a session after a full page reload.
- `role` (PLAYER|ADMIN) and `participatesInLadder` (boolean, orthogonal to role) both gate access.
  `participatesInLadder=false` marks coach-admins: full admin rights, but excluded from the ladder,
  challenges, and points. Don't add a third role value for this — extend the flag's usage instead,
  the same way a future "player who opts out of the ladder" case is meant to reuse it.

### Match negotiation state machine

`Match.status`: `NEGOTIATING → SCHEDULED → RESULT_PENDING → COMPLETED`, with `DECLINED`,
`RESULT_DISPUTED`, and `CANCELLED` as side branches. Every transition is also appended to
`MatchEvent` (indexed on `(matchId, createdAt)`), which doubles as both the on-site negotiation
thread UI and the content re-embedded in notification emails — don't mutate `Match` state without
also writing the corresponding `MatchEvent`, or the two will drift. Full transition table and the
points-award formula (upset vs. standard win) are in docs/architecture.md.

Result confirmation has two parallel paths that must stay in sync: the authenticated web flow
(`POST /api/matches/:id/result`) and the public token flow
(`GET`/`POST /api/results/token/:token`, driven by `MatchResultToken` rows — one per
(match, user, outcome), single-use, all voided together the moment a match reaches `COMPLETED`).

### Scheduled jobs

In-process `node-cron` (`api/src/jobs/scheduler.ts`), started from `api/src/index.ts` alongside
the Express listener — not a separate process. Assumes a single always-on replica
(`minReplicas=maxReplicas=1`); job bodies use idempotency flags (`reminderSentAt`,
`staleResultReminderSentAt`) so a double-fire is harmless if that assumption is ever relaxed.

### Known gap: registration code uniqueness

`api/prisma/MIGRATION_NOTES.md` documents a required hand-written follow-up migration (a partial
unique index, `WHERE used_at IS NULL`, on `registration_codes.code`) that Prisma schema syntax
can't express natively. As of the current migration history, only the `init` migration exists —
that follow-up migration has not been created yet, so active-code uniqueness is not yet enforced
at the DB level (`registrationCodeService.ts` assumes it is, via retry-on-conflict). Create it
before relying on registration codes at any real scale.

### Frontend structure

React Router routes are guarded by `RequireAuth`/`RequireAdmin` components
(`web/src/components/`), fed from `AuthContext`. Server state goes through TanStack Query; API
calls are thin typed wrappers under `web/src/api/*.ts`, all funneled through the single
`apiFetch` helper in `web/src/api/client.ts` (attaches the bearer token, normalizes Zod
validation error bodies into a readable message, throws `ApiError`). Global styling lives in
`web/src/styles/global.css` (a tennis-court green/yellow theme, Poppins/Inter fonts) and is
applied through plain element selectors plus a small set of layout classes
(`app-shell`, `page-content`, `auth-page`/`auth-card`, `navbar*`) — most components render plain
semantic HTML with no per-component className styling.
