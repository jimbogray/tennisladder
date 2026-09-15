# Deploying to Azure

Three environments, each with its own database:

| | Local | Staging | Production |
|---|---|---|---|
| Site | `http://localhost:5173` | `https://staging.playmore.tennis` | `https://www.playmore.tennis` |
| API | `http://localhost:4000` | `https://api.staging.playmore.tennis` | `https://api.playmore.tennis` |
| Database | Postgres on your laptop | `tennisladder-staging-db` | `tennisladder-prod-db` |
| Resource group | — | `tennisladder-staging-rg` | `tennisladder-prod-rg` |
| Deployed by | you, `npm run dev:*` | every merge to `main` | promoting a commit that passed staging |
| Email | never sends | never sends | Azure Communication Services |

Hosting: **Static Web Apps** for the site, **Container Apps** for the API, **PostgreSQL Flexible
Server** for data, all in `eastus2`. One container registry is shared by both hosted environments.
The domain is registered at GoDaddy and uses GoDaddy's DNS; `playmore.tennis` itself forwards to
`www`.

Provisioning is scripted in [`infra/`](../infra) and every script accepts `DRY_RUN=1`, which
prints what would change without changing anything.

---

## How the pipeline works

Moving from one environment to two changes the pipeline in five ways.

**1. Build once, promote the same image.** A merge to `main` builds the API image a single time,
tagged with the commit SHA, and deploys it to staging. Production never rebuilds — it deploys the
exact image staging ran. What you tested is byte-for-byte what ships.

**2. Production is a deliberate promotion, not a merge side-effect.** Running
`deploy-production.yml` *is* the release decision. It refuses any commit that hasn't deployed
successfully to staging:

```bash
gh workflow run deploy-production.yml                  # latest commit that passed staging
gh workflow run deploy-production.yml -f sha=<commit>  # a specific earlier one (rollback)
```

This works on any GitHub plan. If your plan supports required reviewers on a private repository's
environments, you can additionally add reviewers to the `production` environment as a second gate.

**3. The site is built per environment; the API is not.** Vite bakes `VITE_API_BASE_URL` into the
JavaScript at build time, so a site built for staging would call the staging API even if uploaded
to production. The site is therefore rebuilt from the same commit for each environment. The API
reads its configuration at runtime, so its image is shared.

**4. Each environment migrates its own database, from the commit being deployed.** The migrate job
checks out the promoted commit rather than the latest `main`, so migrations always match the image.
Promoting an older commit to production runs that commit's migrations.

**5. The same workflow serves both, with environment-scoped settings.** Secrets and variables live
on the GitHub `staging` and `production` environments under identical names with different values,
so one reusable workflow deploys either without knowing which.

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | pull requests, pushes to `main` | typecheck, build the site, build the image |
| `deploy-staging.yml` | merge to `main` | build the image once → deploy staging |
| `deploy-production.yml` | manual | verify the commit passed staging → deploy production |
| `deploy-environment.yml` | called by the two above | migrate → roll out API image + build and upload site |

### Least-privilege deploy identities

Each environment has its own Microsoft Entra identity, trusted only by its own GitHub environment:

| Identity | Can manage | Registry |
|---|---|---|
| `tennisladder-deploy-staging` | `tennisladder-staging-rg` | builds and pushes images |
| `tennisladder-deploy-prod` | `tennisladder-prod-rg` | none |

A compromised or buggy staging run therefore can't touch production. Production needs no registry
rights: it only repoints its Container App at an existing tag, and the Container App pulls the image
with its own managed identity.

---

## How the environments stay isolated

- **Data** — separate Postgres servers, so a staging migration or test can never reach production.
- **Sessions** — each environment generates its own JWT secrets, so a token from one is rejected by
  the other. Refresh cookies are host-only, so `api.staging.playmore.tennis` and
  `api.playmore.tennis` never see each other's.
- **CORS** — each API accepts credentialed requests only from its own site.
- **Email** — staging is provisioned without Communication Services, so it doesn't send email.
  Instead, `LOG_EMAIL_LINKS=true` makes the API log each unsent email's recipient, subject and
  links (password reset, invite, result confirmation), so those flows can still be completed:
  `az containerapp logs show -g tennisladder-staging-rg -n tennisladder-staging-api --follow`.
  Those links are live credentials, which is why production never sets the flag. Never copy
  production data into staging while email is enabled there: reminder jobs would message real
  players.
- **Search engines** — the staging deploy publishes a `robots.txt` that disallows indexing.

## Why the domain is load-bearing

The refresh token lives in an httpOnly cookie with `sameSite: "lax"`, which is only sent when the
site and API are the same *site* — the same registrable domain, `playmore.tennis`:

| Setup | Same site? | Refresh cookie sent? |
|---|---|---|
| `*.azurestaticapps.net` → `*.azurecontainerapps.io` | No | **No — third-party cookie, blocked by Safari** |
| `staging.playmore.tennis` → `api.staging.playmore.tennis` | Yes | Yes |
| `www.playmore.tennis` → `api.playmore.tennis` | Yes | Yes |

So neither environment may be served from Azure's default hostnames. And because each API's CORS
allow-list is a single origin, production's canonical site is `www` and the bare domain forwards to
it rather than also serving the site.

---

## Local development

Unchanged: a local Postgres, `api/.env` and `web/.env` copied from their `.env.example` files, and
`npm run dev:api` / `npm run dev:web`. Don't point a local checkout at a hosted database — run
migrations locally with `npm run prisma:migrate` and let the pipeline apply them to staging and
then production.

---

## Setting it up

Do staging end to end first, confirm a deploy works, then repeat for production.

### 0. Prerequisites

```bash
az login
az account set --subscription "<subscription-name-or-id>"
az extension add --name containerapp --upgrade
gh auth login

# On a fresh subscription, register the resource providers (idempotent)
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry \
          Microsoft.DBforPostgreSQL Microsoft.Web Microsoft.Communication; do
  az provider register --namespace "$ns"
done
```

The subscription also hosts unrelated projects. The scripts only ever create and modify resources
inside the `tennisladder-*` resource groups.

### 1. Shared registry

```bash
./infra/provision-shared.sh
```

Registry names are globally unique. If `tennisladderacr` is taken, the script stops and tells you
to set `ACR_NAME=<another name>`; use the same value for every later script.

### 2. Provision the environment

```bash
PG_ADMIN_PASSWORD='<strong password>' ./infra/provision-environment.sh staging
```

Creates the resource group, Postgres server and database, Container Apps environment and app,
Static Web App, and the GitHub deploy identity. Postgres takes several minutes. Keep the password —
steps 5 and 7 need it again.

Re-running is safe. Existing resources are left alone, and JWT secrets are only generated when
missing, since regenerating them would sign every user out.

### 3. DNS records

```bash
./infra/dns-records.sh staging
```

Prints the records to add in GoDaddy → **My Products → playmore.tennis → DNS**, then checks public
DNS. For staging they are a CNAME for `staging`, a CNAME for `api.staging`, and a TXT record for
`asuid.api.staging` proving you own the domain. Re-run it until every line shows `[ok]`; a new
domain's first records can take a while to propagate.

For **production**, GoDaddy creates a default `www` CNAME on new domains — edit that record rather
than adding a second. Also set **DNS → Forwarding**: `playmore.tennis` → `https://www.playmore.tennis`,
Permanent (301), Forward only. GoDaddy DNS can't point the bare domain at Azure directly.

### 4. Bind the domains

```bash
./infra/bind-domains.sh staging
```

Refuses to run until DNS resolves, then binds both hostnames and issues free managed certificates.
Do this **before the first deploy**: the deploy's smoke check calls the API's custom hostname.

### 5. Configure GitHub

```bash
PG_ADMIN_PASSWORD='<same password>' GOOGLE_MAPS_API_KEY='<browser key>' \
  ./infra/configure-github.sh staging
```

Creates the GitHub environment and sets its secrets and variables from values read out of Azure.
Secret values are piped to `gh` over stdin, so they don't appear in your shell history or process
list. Then add `https://staging.playmore.tennis/*` to the Maps key's HTTP referrer restrictions.

### 6. First deploy

Merge to `main` (or run `gh workflow run deploy-staging.yml`) and check
`https://staging.playmore.tennis`.

### 7. Create the first admin

A new environment has no accounts, and registering needs an invite that only an admin can send. So
after the first deploy has applied migrations, create an admin from your laptop:

```bash
./infra/create-admin.sh staging
```

It prompts for the Postgres admin password from step 2, then the admin's email and password (at
least 12 characters, not echoed). It opens the database firewall to your public IP for the run and
removes that rule on exit, even on failure or Ctrl-C.

The account it creates is a coach-admin: full admin rights, but not on the ladder. To be an admin
who also plays, register through an invite first, then run the script with that email. An existing
account is promoted and its password reset, and it keeps its place on the ladder. Running the script
again for the same email is also how you reset a lost admin password.

Set `ADMIN_FIRST_NAME` / `ADMIN_LAST_NAME` to name a new account (default "Admin User"). Then sign
in and send invites from **Invites** in the menu — staging logs emails rather than sending them, so copy
the invite code from the page.

### 8. Production

Repeat steps 2–5 with `production`, set up the forwarding described in step 3, then:

```bash
gh workflow run deploy-production.yml
./infra/create-admin.sh production
```

Use a different admin password than staging.

### 9. Production email

Create Communication Services, connect `playmore.tennis` as a sending domain (it adds more TXT
records in GoDaddy), then re-run provisioning with the connection string:

```bash
ACS_CONNECTION_STRING='<connection string>' EMAIL_FROM_ADDRESS='ladder@playmore.tennis' \
  ./infra/provision-environment.sh production
```

---

## The earlier `tennisladder-rg`

The first attempt created `tennisladder-db` in `tennisladder-rg`. It isn't part of this layout and
**can't work as-is**: it was created with public access Disabled, which rules out the firewall
rules both the API and the pipeline need. It's empty, so delete it rather than repair it — it bills
for as long as it exists:

```bash
az group delete --name tennisladder-rg
```

---

## Troubleshooting

**`The location is restricted from performing this operation`** — Postgres provisioning is
capacity-blocked in that region for the subscription; it isn't a quota you can raise from the CLI.
`eastus` is blocked here, which is why everything uses `eastus2`. Check a region first:

```bash
az postgres flexible-server list-skus --location <region> \
  --query "[0].{reason:reason, editions:length(supportedServerEditions)}" -o table
```

**`Firewall rule operations are not supported for a server without public access enabled`** —
the server has public access Disabled. Re-running `provision-environment.sh` detects this and
switches it to Enabled. Enabled with no firewall rules still admits no connections.

**`unrecognized arguments: --rule-name`** — current Azure CLI versions name the server
`--server-name` and the rule `--name` for `firewall-rule` and `db` commands. Older instructions
elsewhere use the previous flags.

**`AADSTS700213` when a workflow signs in to Azure** — the federated credential subject must name
the GitHub environment (`repo:jimbogray/tennisladder:environment:staging`), not a branch. Re-run
`provision-environment.sh` to recreate it.

**Smoke check fails on the first deploy** — the API's custom hostname isn't bound yet; run
`bind-domains.sh` for that environment.

**`create-admin.sh`: `the users table doesn't exist`** — no deploy has run migrations against that
database yet. Run the environment's deploy workflow first.

**`create-admin.sh`: `database still unreachable`** — something between your laptop and Azure blocks
outbound port 5432, which some office and public networks do. Try another network.

**Production refuses a commit** — it hasn't deployed successfully to staging. Merge it to `main`
(or rerun the staging workflow for it) first.

---

## Before you rely on this in production

- **Registration codes have no uniqueness constraint.** `prisma/MIGRATION_NOTES.md` specifies a
  partial unique index (`WHERE used_at IS NULL`) that was never created, and
  `registrationCodeService` assumes it exists when it retries on collision.
- **Disputed results have no resolution path.** `adminOverrideResult` is still a stub.
- **Result tokens are never generated**, so the "I won / I lost" email links are unreachable.
- **No backup policy configured.** Flexible Server keeps 7 days of automated backups by default;
  raise it for production and decide on geo-redundancy before real data lands.