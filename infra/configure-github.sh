#!/usr/bin/env bash
# Creates the GitHub environment for one hosted environment and fills in the secrets and variables
# the deploy workflows read. Values come straight from Azure, so nothing is copied by hand.
#
#   PG_ADMIN_PASSWORD='...' GOOGLE_MAPS_API_KEY='...' ./infra/configure-github.sh staging
#   DRY_RUN=1 ./infra/configure-github.sh production
#
# Secrets and variables are scoped to the GitHub environment, so staging and production use the
# same names with different values — the workflows never need to know which one they're in.
set -euo pipefail
. "$(dirname "$0")/config.sh"

load_environment "${1:-}"
require_az_login
command -v gh >/dev/null || die "GitHub CLI (gh) is required"
gh auth status >/dev/null 2>&1 || die "GitHub CLI is not signed in — run 'gh auth login' first"

if [ -z "${PG_ADMIN_PASSWORD:-}" ]; then
  if [ "${DRY_RUN:-0}" = "1" ]; then
    PG_ADMIN_PASSWORD="dry-run-placeholder"
  else
    [ -t 0 ] || die "PG_ADMIN_PASSWORD is required (the migrate job connects to the database)"
    read -rsp "Postgres admin password for ${PG_SERVER}: " PG_ADMIN_PASSWORD
    echo
  fi
fi

# Secret values are piped on stdin rather than passed as arguments, so they never show up in the
# process list or shell history.
set_secret() {
  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "[dry-run] gh secret set $1 --env ${ENVIRONMENT}"
  else
    printf '%s' "$2" | gh secret set "$1" --env "$ENVIRONMENT" --repo "$GITHUB_REPO"
  fi
}
set_variable() {
  run gh variable set "$1" --env "$ENVIRONMENT" --repo "$GITHUB_REPO" --body "$2"
}

lookup() {
  local value
  value="$("$@" 2>/dev/null || true)"
  if [ -z "$value" ]; then
    [ "${DRY_RUN:-0}" = "1" ] || die "lookup failed: $* — has ${ENVIRONMENT} been provisioned?"
    value="<pending>"
  fi
  printf '%s' "$value"
}

CLIENT_ID="$(lookup az ad app list --display-name "$DEPLOY_IDENTITY" --query "[0].appId" --output tsv)"
TENANT_ID="$(lookup az account show --query tenantId --output tsv)"
SUBSCRIPTION_ID="$(lookup az account show --query id --output tsv)"
SWA_TOKEN="$(lookup az staticwebapp secrets list --resource-group "$RG" --name "$SWA_NAME" \
  --query properties.apiKey --output tsv)"

info "GitHub environment '${ENVIRONMENT}'"
run gh api --method PUT "repos/${GITHUB_REPO}/environments/${ENVIRONMENT}" --silent

info "Secrets"
set_secret AZURE_CLIENT_ID "$CLIENT_ID"
set_secret AZURE_TENANT_ID "$TENANT_ID"
set_secret AZURE_SUBSCRIPTION_ID "$SUBSCRIPTION_ID"
set_secret AZURE_STATIC_WEB_APPS_API_TOKEN "$SWA_TOKEN"
set_secret DATABASE_URL "$(database_url "$PG_ADMIN_PASSWORD")"
if [ -n "${GOOGLE_MAPS_API_KEY:-}" ]; then
  set_secret GOOGLE_MAPS_API_KEY "$GOOGLE_MAPS_API_KEY"
else
  info "GOOGLE_MAPS_API_KEY not set — the site will build without Places autocomplete or maps"
fi

info "Variables"
set_variable AZURE_RESOURCE_GROUP "$RG"
set_variable POSTGRES_SERVER_NAME "$PG_SERVER"
set_variable CONTAINER_APP_NAME "$API_APP"
set_variable API_BASE_URL "$API_BASE_URL"

# The registry is shared, so its name is a repository-wide variable rather than per environment.
info "Repository variable ACR_NAME"
run gh variable set ACR_NAME --repo "$GITHUB_REPO" --body "$ACR_NAME"

echo
info "GitHub configured for ${ENVIRONMENT}."
if [ -n "${GOOGLE_MAPS_API_KEY:-}" ]; then
  echo "    Add ${SITE_URL}/* to the Maps key's HTTP referrer restrictions."
fi
