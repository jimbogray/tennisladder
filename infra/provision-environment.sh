#!/usr/bin/env bash
# Creates (or tops up) everything one hosted environment needs: its own resource group, Postgres
# server, Container App for the API, Static Web App for the site, and a GitHub deploy identity
# that can only touch this environment.
#
#   PG_ADMIN_PASSWORD='...' ./infra/provision-environment.sh staging
#   DRY_RUN=1 ./infra/provision-environment.sh production
#
# Safe to re-run. Existing resources are left alone, and JWT secrets are only generated when
# missing — regenerating them would sign every user out.
#
# Optional environment variables:
#   PG_ADMIN_PASSWORD      Needed when the Postgres server or its connection-string secret doesn't
#                          exist yet (prompted for if unset). Setting it re-applies the secret.
#   ACS_CONNECTION_STRING  Enables outbound email. Leave unset for staging so it can't email
#                          real people.
#   EMAIL_FROM_ADDRESS     Sender address; defaults to ladder@<domain>.
set -euo pipefail
. "$(dirname "$0")/config.sh"

load_environment "${1:-}"
require_az_login

PENDING="<pending>"

ensure_password() {
  [ -n "${PG_ADMIN_PASSWORD:-}" ] && return
  if [ "${DRY_RUN:-0}" = "1" ]; then
    PG_ADMIN_PASSWORD="dry-run-placeholder"
    return
  fi
  [ -t 0 ] || die "PG_ADMIN_PASSWORD is required: the Postgres server or its connection string isn't set up yet"
  read -rsp "Postgres admin password for ${PG_SERVER}: " PG_ADMIN_PASSWORD
  echo
  [ -n "$PG_ADMIN_PASSWORD" ] || die "password cannot be empty"
}

# Grants a role once; re-runs find the existing assignment and skip it.
ensure_role() {
  local principal="$1" role="$2" scope="$3" label="$4" count
  if [ "$principal" = "$PENDING" ] || [ "$scope" = "$PENDING" ]; then
    info "Granting ${role} on ${label}"
    run az role assignment create --assignee-object-id "$principal" \
      --assignee-principal-type ServicePrincipal --role "$role" --scope "$scope" --output none
    return
  fi
  count="$(az role assignment list --assignee "$principal" --role "$role" --scope "$scope" \
    --query "length(@)" --output tsv 2>/dev/null || echo 0)"
  if [ "$count" = "0" ]; then
    info "Granting ${role} on ${label}"
    run az role assignment create --assignee-object-id "$principal" \
      --assignee-principal-type ServicePrincipal --role "$role" --scope "$scope" --output none
  else
    info "${role} on ${label} already granted"
  fi
}

ACR_ID="$(az acr show --name "$ACR_NAME" --resource-group "$SHARED_RG" --query id --output tsv 2>/dev/null || true)"
if [ -z "$ACR_ID" ]; then
  [ "${DRY_RUN:-0}" = "1" ] || die "registry ${ACR_NAME} not found — run ./infra/provision-shared.sh first"
  ACR_ID="$PENDING"
fi

echo
info "Provisioning ${ENVIRONMENT}: ${SITE_URL} + https://${API_HOST}"
echo

# --- Resource group ---------------------------------------------------------------------------
info "Resource group ${RG}"
run az group create --name "$RG" --location "$LOCATION" --output none

# --- Database ---------------------------------------------------------------------------------
# Public access must be *Enabled*. It sounds backwards, but a server with public access Disabled
# refuses firewall rules altogether — and both the Container App (via the Azure-services rule
# below) and the pipeline's temporary migration rule depend on them. Enabled with no rules still
# admits nobody until a rule is added. (`--public-access None` produces Disabled on current CLIs.)
PG_PUBLIC_ACCESS="$(az postgres flexible-server show --resource-group "$RG" --name "$PG_SERVER" \
  --query network.publicNetworkAccess --output tsv 2>/dev/null || true)"
if [ -z "$PG_PUBLIC_ACCESS" ]; then
  ensure_password
  info "Creating Postgres server ${PG_SERVER} (takes several minutes)"
  run az postgres flexible-server create --resource-group "$RG" --name "$PG_SERVER" \
    --location "$LOCATION" --tier Burstable --sku-name Standard_B1ms --storage-size 32 \
    --version 16 --admin-user "$PG_ADMIN_USER" --admin-password "$PG_ADMIN_PASSWORD" \
    --public-access Enabled --yes --output none
elif [ "$PG_PUBLIC_ACCESS" != "Enabled" ]; then
  info "Postgres server ${PG_SERVER} exists but public access is ${PG_PUBLIC_ACCESS} — enabling so firewall rules work"
  run az postgres flexible-server update --resource-group "$RG" --name "$PG_SERVER" \
    --public-access Enabled --output none
else
  info "Postgres server ${PG_SERVER} already exists"
fi

if az postgres flexible-server db show --resource-group "$RG" --server-name "$PG_SERVER" \
  --name "$PG_DATABASE" --output none 2>/dev/null; then
  info "Database ${PG_DATABASE} already exists"
else
  info "Creating database ${PG_DATABASE}"
  run az postgres flexible-server db create --resource-group "$RG" --server-name "$PG_SERVER" \
    --name "$PG_DATABASE" --output none
fi

# 0.0.0.0 is Azure's special "any Azure service" rule, not the open internet. The Container App has
# no fixed egress IP without VNet integration, so this is how it reaches the database.
if az postgres flexible-server firewall-rule show --resource-group "$RG" --server-name "$PG_SERVER" \
  --name AllowAzureServices --output none 2>/dev/null; then
  info "Firewall rule AllowAzureServices already exists"
else
  info "Allowing Azure services to reach ${PG_SERVER}"
  run az postgres flexible-server firewall-rule create --resource-group "$RG" --server-name "$PG_SERVER" \
    --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 --output none
fi

# --- API: Container App -----------------------------------------------------------------------
if az containerapp env show --resource-group "$RG" --name "$CONTAINERAPP_ENV" --output none 2>/dev/null; then
  info "Container Apps environment ${CONTAINERAPP_ENV} already exists"
else
  info "Creating Container Apps environment ${CONTAINERAPP_ENV}"
  run az containerapp env create --resource-group "$RG" --name "$CONTAINERAPP_ENV" \
    --location "$LOCATION" --output none
fi

if az containerapp show --resource-group "$RG" --name "$API_APP" --output none 2>/dev/null; then
  info "Container App ${API_APP} already exists"
else
  # Placeholder image until the first pipeline run. min=max=1 replica keeps the in-process cron
  # jobs running (scale-to-zero would stop them) without letting them double-fire.
  info "Creating Container App ${API_APP}"
  run az containerapp create --resource-group "$RG" --name "$API_APP" \
    --environment "$CONTAINERAPP_ENV" --image mcr.microsoft.com/k8se/quickstart:latest \
    --target-port 4000 --ingress external --min-replicas 1 --max-replicas 1 \
    --cpu 0.5 --memory 1Gi --output none
fi

info "Giving ${API_APP} a managed identity to pull from ${ACR_NAME}"
run az containerapp identity assign --resource-group "$RG" --name "$API_APP" --system-assigned --output none
APP_PRINCIPAL="$(az containerapp show --resource-group "$RG" --name "$API_APP" \
  --query identity.principalId --output tsv 2>/dev/null || true)"
APP_PRINCIPAL="${APP_PRINCIPAL:-$PENDING}"
ensure_role "$APP_PRINCIPAL" AcrPull "$ACR_ID" "$ACR_NAME (for ${API_APP})"
run az containerapp registry set --resource-group "$RG" --name "$API_APP" \
  --server "${ACR_NAME}.azurecr.io" --identity system --output none

# Secrets. Only missing ones are created, so re-running never rotates live JWT secrets.
EXISTING_SECRETS="$(az containerapp secret list --resource-group "$RG" --name "$API_APP" \
  --query "[].name" --output tsv 2>/dev/null || true)"
# No pipe into grep -q here: under pipefail an early-exiting grep can make the pipeline report
# failure, which would read as "secret missing" and regenerate live JWT secrets.
has_secret() {
  local name
  for name in $EXISTING_SECRETS; do
    [ "$name" = "$1" ] && return 0
  done
  return 1
}

SECRET_ARGS=()
SECRET_NAMES=""
add_secret() { SECRET_ARGS+=("$1=$2"); SECRET_NAMES="${SECRET_NAMES} $1"; }

has_secret jwt-access-secret || add_secret jwt-access-secret "$(openssl rand -base64 48)"
has_secret jwt-refresh-secret || add_secret jwt-refresh-secret "$(openssl rand -base64 48)"
if ! has_secret database-url || [ -n "${PG_ADMIN_PASSWORD:-}" ]; then
  ensure_password
  add_secret database-url "$(database_url "$PG_ADMIN_PASSWORD")"
fi
[ -n "${ACS_CONNECTION_STRING:-}" ] && add_secret acs-connection "$ACS_CONNECTION_STRING"

if [ -n "$SECRET_NAMES" ]; then
  info "Setting secrets:${SECRET_NAMES}"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "[dry-run] az containerapp secret set --resource-group $RG --name $API_APP --secrets <${SECRET_NAMES# }>"
  else
    az containerapp secret set --resource-group "$RG" --name "$API_APP" \
      --secrets "${SECRET_ARGS[@]}" --output none
  fi
else
  info "All secrets already set"
fi

ENV_VARS=(
  "NODE_ENV=production"
  "PORT=4000"
  "WEB_APP_URL=${SITE_URL}"
  "DATABASE_URL=secretref:database-url"
  "JWT_ACCESS_SECRET=secretref:jwt-access-secret"
  "JWT_REFRESH_SECRET=secretref:jwt-refresh-secret"
)
if has_secret acs-connection || [ -n "${ACS_CONNECTION_STRING:-}" ]; then
  ENV_VARS+=("AZURE_COMMUNICATION_CONNECTION_STRING=secretref:acs-connection")
  ENV_VARS+=("EMAIL_FROM_ADDRESS=${EMAIL_FROM_ADDRESS:-ladder@${DOMAIN}}")
fi
info "Setting app configuration (WEB_APP_URL=${SITE_URL})"
run az containerapp update --resource-group "$RG" --name "$API_APP" \
  --set-env-vars "${ENV_VARS[@]}" --output none

# --- Site: Static Web App ---------------------------------------------------------------------
if az staticwebapp show --resource-group "$RG" --name "$SWA_NAME" --output none 2>/dev/null; then
  info "Static Web App ${SWA_NAME} already exists"
else
  info "Creating Static Web App ${SWA_NAME} (${SWA_SKU})"
  run az staticwebapp create --resource-group "$RG" --name "$SWA_NAME" \
    --location "$LOCATION" --sku "$SWA_SKU" --output none
fi

# --- GitHub deploy identity -------------------------------------------------------------------
# One identity per environment, each able to touch only its own resource group. The staging
# identity additionally builds images (az acr build runs an ACR Task, which AcrPush doesn't allow).
APP_ID="$(az ad app list --display-name "$DEPLOY_IDENTITY" --query "[0].appId" --output tsv 2>/dev/null || true)"
if [ -z "$APP_ID" ]; then
  info "Creating app registration ${DEPLOY_IDENTITY}"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    run az ad app create --display-name "$DEPLOY_IDENTITY"
    APP_ID="$PENDING"
  else
    APP_ID="$(az ad app create --display-name "$DEPLOY_IDENTITY" --query appId --output tsv)"
  fi
else
  info "App registration ${DEPLOY_IDENTITY} already exists"
fi

SP_ID=""
[ "$APP_ID" != "$PENDING" ] &&
  SP_ID="$(az ad sp show --id "$APP_ID" --query id --output tsv 2>/dev/null || true)"
if [ -z "$SP_ID" ]; then
  info "Creating service principal for ${DEPLOY_IDENTITY}"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    run az ad sp create --id "$APP_ID"
    SP_ID="$PENDING"
  else
    SP_ID="$(az ad sp create --id "$APP_ID" --query id --output tsv)"
  fi
fi

# The subject must name the GitHub *environment*, because the deploy jobs declare one.
SUBJECT="repo:${GITHUB_REPO}:environment:${ENVIRONMENT}"
CREDENTIAL_COUNT=0
[ "$APP_ID" != "$PENDING" ] && CREDENTIAL_COUNT="$(az ad app federated-credential list --id "$APP_ID" \
  --query "length([?subject=='${SUBJECT}'])" --output tsv 2>/dev/null || echo 0)"
if [ "$CREDENTIAL_COUNT" = "0" ]; then
  info "Trusting GitHub environment '${ENVIRONMENT}' (${SUBJECT})"
  run az ad app federated-credential create --id "$APP_ID" --parameters "{
    \"name\": \"github-${ENVIRONMENT}\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"${SUBJECT}\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" --output none
else
  info "GitHub environment '${ENVIRONMENT}' already trusted"
fi

RG_ID="$(az group show --name "$RG" --query id --output tsv 2>/dev/null || true)"
ensure_role "$SP_ID" Contributor "${RG_ID:-$PENDING}" "$RG"
if [ "$ENVIRONMENT" = "staging" ]; then
  ensure_role "$SP_ID" Contributor "$ACR_ID" "$ACR_NAME (image builds)"
fi

echo
info "Provisioned ${ENVIRONMENT}. Next:"
echo "    ./infra/dns-records.sh ${ENVIRONMENT}      # records to add at GoDaddy"
echo "    ./infra/bind-domains.sh ${ENVIRONMENT}     # once DNS resolves"
echo "    ./infra/configure-github.sh ${ENVIRONMENT} # secrets and variables for the pipeline"
