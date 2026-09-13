# Deploying to Azure

Target shape, as committed in [architecture.md](architecture.md): **Container Apps** for the API,
**Static Web Apps** for the SPA, **PostgreSQL Flexible Server** for data, fronted by two subdomains
of one custom domain.

Replace `yourclub.com`, region `uksouth`, and the names below to taste.

---

## Why the custom domain is load-bearing

The refresh token lives in an httpOnly cookie with `sameSite: "lax"`. SameSite is judged on the
*site* (registrable domain), not the origin:

| Setup | Same site? | Refresh cookie sent? |
|---|---|---|
| `app.azurestaticapps.net` → `api.azurecontainerapps.io` | No | **No — silent logout on every reload** |
| `app.yourclub.com` → `api.yourclub.com` | Yes | Yes |

So both hosts must sit under one registrable domain. The requests are still *cross-origin*, which
is already handled: the API sets `cors({ origin: WEB_APP_URL, credentials: true })`.

If you ever drop the custom domain, the cookie must change to `sameSite: "none"` (which also
requires `secure`, and widens CSRF exposure on `/api/auth/refresh`).

## Other things that bite

- **`VITE_API_BASE_URL` is baked in at build time.** Vite inlines it during `vite build`; it is not
  runtime config. The pipeline sets it from the `API_BASE_URL` variable. Changing the API URL means
  rebuilding the SPA, not editing an app setting.
- **`minReplicas` must be 1.** The reminder jobs are in-process `node-cron` on the API. Container
  Apps scales to zero by default, which would silently stop them. `maxReplicas` is also 1 so the
  jobs don't double-fire (see architecture.md).
- **Postgres requires TLS.** `DATABASE_URL` needs `?sslmode=require`.
- **SPA deep links need `staticwebapp.config.json`.** Already committed at
  `web/public/staticwebapp.config.json`; Vite copies it into `dist/`. Without its
  `navigationFallback`, refreshing `/matches/<id>` returns 404.
- **JWT secrets now fail fast.** `env.ts` throws in production if `JWT_ACCESS_SECRET` or
  `JWT_REFRESH_SECRET` is missing, rather than falling back to the dev defaults committed in the
  repo — those would let anyone mint an admin token.

---

## Resources to create

| Resource | Purpose | Suggested SKU |
|---|---|---|
| Resource group | Groups everything | — |
| PostgreSQL Flexible Server + database | Data | Burstable `Standard_B1ms`, 32 GB |
| Container Registry (ACR) | Holds the API image | Basic |
| Container Apps environment | Runtime for the API | Consumption |
| Container App | The API | 0.5 vCPU / 1 GB, min=max=1 replica |
| Static Web App | The SPA | Standard (Free tier can't bind custom domains with SLA) |
| Communication Services + Email Communication Service | Outbound email | Pay-as-you-go |
| Microsoft Entra app registration | GitHub OIDC deploy identity | — |

Log Analytics is created automatically with the Container Apps environment.

---

## Setup

### 1. Resource group and database

```bash
az group create -n tennisladder-rg -l uksouth

az postgres flexible-server create \
  -g tennisladder-rg -n tennisladder-db -l uksouth \
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
  --admin-user tladmin --admin-password '<strong-password>' \
  --public-access None --yes

az postgres flexible-server db create \
  -g tennisladder-rg -s tennisladder-db -d tennisladder
```

Let Azure-hosted services reach it (Container Apps has no fixed egress IP without VNet
integration). This special `0.0.0.0` rule means "any Azure service", not "the internet" — access
still needs credentials, but tightening it to a VNet is the hardening step when you want one:

```bash
az postgres flexible-server firewall-rule create \
  -g tennisladder-rg -n tennisladder-db \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
```

Connection string for later:

```
postgresql://tladmin:<password>@tennisladder-db.postgres.database.azure.com:5432/tennisladder?sslmode=require
```

### 2. Registry and Container App

```bash
az acr create -g tennisladder-rg -n tennisladderacr --sku Basic

az containerapp env create -g tennisladder-rg -n tennisladder-env -l uksouth

# Placeholder image; the first pipeline run replaces it.
az containerapp create \
  -g tennisladder-rg -n tennisladder-api \
  --environment tennisladder-env \
  --image mcr.microsoft.com/k8se/quickstart:latest \
  --target-port 4000 --ingress external \
  --min-replicas 1 --max-replicas 1 \
  --cpu 0.5 --memory 1Gi
```

Let the app pull from ACR with its own identity rather than a stored password:

```bash
PRINCIPAL=$(az containerapp identity assign \
  -g tennisladder-rg -n tennisladder-api --system-assigned \
  --query principalId -o tsv)

az role assignment create \
  --assignee "$PRINCIPAL" --role AcrPull \
  --scope $(az acr show -n tennisladderacr --query id -o tsv)

az containerapp registry set \
  -g tennisladder-rg -n tennisladder-api \
  --server tennisladderacr.azurecr.io --identity system
```

### 3. API configuration

```bash
az containerapp secret set \
  -g tennisladder-rg -n tennisladder-api \
  --secrets \
    database-url="postgresql://tladmin:<password>@tennisladder-db.postgres.database.azure.com:5432/tennisladder?sslmode=require" \
    jwt-access-secret="$(openssl rand -base64 48)" \
    jwt-refresh-secret="$(openssl rand -base64 48)" \
    acs-connection="<from step 5>"

az containerapp update \
  -g tennisladder-rg -n tennisladder-api \
  --set-env-vars \
    NODE_ENV=production \
    PORT=4000 \
    WEB_APP_URL=https://app.yourclub.com \
    DATABASE_URL=secretref:database-url \
    JWT_ACCESS_SECRET=secretref:jwt-access-secret \
    JWT_REFRESH_SECRET=secretref:jwt-refresh-secret \
    AZURE_COMMUNICATION_CONNECTION_STRING=secretref:acs-connection \
    EMAIL_FROM_ADDRESS=ladder@yourclub.com
```

`WEB_APP_URL` is both the CORS allow-list entry and the base for invite links — it must be the
SPA's public URL exactly, scheme included.

### 4. Static Web App

```bash
az staticwebapp create -g tennisladder-rg -n tennisladder-web -l westeurope --sku Standard

# Deployment token -> GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN
az staticwebapp secrets list -g tennisladder-rg -n tennisladder-web \
  --query "properties.apiKey" -o tsv
```

### 5. Email (Communication Services)

Until this exists, `emailService` logs and returns instead of sending — invites silently go
nowhere. Create the resource, connect a domain (Azure-managed is fine to start), then put the
connection string into the `acs-connection` secret above.

### 6. Custom domains

```bash
# SPA: CNAME app -> <default SWA hostname>
az staticwebapp hostname set -g tennisladder-rg -n tennisladder-web --hostname app.yourclub.com

# API: CNAME api -> <container app FQDN>, plus a TXT record for validation
az containerapp hostname add -g tennisladder-rg -n tennisladder-api --hostname api.yourclub.com
az containerapp hostname bind -g tennisladder-rg -n tennisladder-api \
  --hostname api.yourclub.com --environment tennisladder-env --validation-method CNAME
```

Both issue managed certificates at no cost.

### 7. GitHub deploy identity (OIDC)

```bash
APP_ID=$(az ad app create --display-name tennisladder-deploy --query appId -o tsv)
az ad sp create --id "$APP_ID"

az role assignment create \
  --assignee "$APP_ID" --role Contributor \
  --scope /subscriptions/<subscription-id>/resourceGroups/tennisladder-rg
```

The workflow jobs use `environment: production`, so the federated credential subject must match
**the environment**, not a branch — this is the usual cause of `AADSTS700213` on first run:

```bash
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:jimbogray/tennisladder:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

---

## GitHub configuration

Create a **production** environment on the repo, then add:

### Secrets

| Name | Value |
|---|---|
| `AZURE_CLIENT_ID` | `$APP_ID` from step 7 |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |
| `DATABASE_URL` | Same connection string as the app secret |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | From step 4 |
| `GOOGLE_MAPS_API_KEY` | Browser key; add `app.yourclub.com` to its referrer restrictions |

### Variables

| Name | Example |
|---|---|
| `AZURE_RESOURCE_GROUP` | `tennisladder-rg` |
| `POSTGRES_SERVER_NAME` | `tennisladder-db` |
| `ACR_NAME` | `tennisladderacr` |
| `CONTAINER_APP_NAME` | `tennisladder-api` |
| `API_BASE_URL` | `https://api.yourclub.com/api` |

---

## How the pipeline works

`.github/workflows/deploy.yml`, on push to `main`:

1. **migrate** — signs in via OIDC, opens the Postgres firewall for the runner's IP, runs
   `prisma migrate deploy`, then closes it again in an `always()` step. Everything else depends on
   this job, so a failed migration ships nothing.
2. **api** — `az acr build` builds the image inside Azure (no Docker or registry login on the
   runner), then `az containerapp update` rolls it out, followed by a polling health check against
   `/api/health`.
3. **web** — builds the SPA with `VITE_API_BASE_URL` baked in and uploads `web/dist`.

`.github/workflows/ci.yml` runs on pull requests: typecheck both workspaces, build the SPA, and
build the container image. There is no test suite, so `tsc --noEmit` is the only automated signal.

---

## Before you rely on this in production

- **Registration codes have no uniqueness constraint.** `prisma/MIGRATION_NOTES.md` specifies a
  partial unique index (`WHERE used_at IS NULL`) that was never created, and
  `registrationCodeService` assumes it exists when it retries on collision.
- **Disputed results have no resolution path.** `adminOverrideResult` is still a stub.
- **Result tokens are never generated**, so the "I won / I lost" email links are unreachable.
- **No backup policy configured.** Flexible Server keeps 7 days of automated backups by default;
  raise it and decide on geo-redundancy before real data lands.
- **Rotate the seeded admin.** `api/scripts/create-admin.ts` contains a hardcoded dev password.
