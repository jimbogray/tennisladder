# Shared naming and settings for the provisioning scripts. Sourced, not executed.
#
# Every Azure resource these scripts create lives in a tennisladder-* resource group. The
# subscription also hosts unrelated projects, so nothing here ever operates subscription-wide.

PREFIX="tennisladder"
LOCATION="eastus2"   # eastus is capacity-blocked for Postgres on this subscription
DOMAIN="playmore.tennis"
GITHUB_REPO="jimbogray/tennisladder"

# Shared across environments: one registry, so the image tested in staging is the exact image
# promoted to production. Registry names are globally unique and alphanumeric only.
SHARED_RG="${PREFIX}-shared-rg"
ACR_NAME="${ACR_NAME:-tennisladderacr}"

PG_ADMIN_USER="tladmin"
PG_DATABASE="tennisladder"

die() { echo "error: $*" >&2; exit 1; }
info() { echo "==> $*"; }

# DRY_RUN=1 prints every command that would change something instead of running it. Read-only
# lookups still run for real, so a dry run reports what already exists.
run() {
  if [ "${DRY_RUN:-0}" = "1" ]; then
    printf '[dry-run]'; printf ' %q' "$@"; echo
  else
    "$@"
  fi
}

# Sets the per-environment names used by every script. Call with "staging" or "production".
load_environment() {
  ENVIRONMENT="$1"
  case "$ENVIRONMENT" in
    staging)
      ENV_SHORT="staging"
      SITE_HOST="staging.${DOMAIN}"
      API_HOST="api.staging.${DOMAIN}"
      SWA_SKU="Free"        # custom domains work on Free; no SLA needed for staging
      ;;
    production)
      ENV_SHORT="prod"
      SITE_HOST="www.${DOMAIN}"
      API_HOST="api.${DOMAIN}"
      SWA_SKU="Standard"
      ;;
    *)
      die "environment must be 'staging' or 'production' (got '${ENVIRONMENT:-}')"
      ;;
  esac

  RG="${PREFIX}-${ENV_SHORT}-rg"
  PG_SERVER="${PREFIX}-${ENV_SHORT}-db"          # globally unique: <name>.postgres.database.azure.com
  CONTAINERAPP_ENV="${PREFIX}-${ENV_SHORT}-env"
  API_APP="${PREFIX}-${ENV_SHORT}-api"
  SWA_NAME="${PREFIX}-${ENV_SHORT}-web"
  DEPLOY_IDENTITY="${PREFIX}-deploy-${ENV_SHORT}"

  SITE_URL="https://${SITE_HOST}"
  API_BASE_URL="https://${API_HOST}/api"
}

require_az_login() {
  az account show >/dev/null 2>&1 || die "Azure CLI is not signed in — run 'az login' first"
}

# Percent-encodes a value for use inside a connection string, so passwords containing @ : / etc.
# don't corrupt the URL.
url_encode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

database_url() {
  local password
  password="$(url_encode "$1")"
  echo "postgresql://${PG_ADMIN_USER}:${password}@${PG_SERVER}.postgres.database.azure.com:5432/${PG_DATABASE}?sslmode=require"
}
