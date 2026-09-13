#!/usr/bin/env bash
# Creates an admin account in a hosted environment, or promotes an existing account to admin.
# A freshly provisioned environment has no users, and registering needs an invite code that only
# an admin can issue — so every environment needs this once.
#
#   ./infra/create-admin.sh staging
#   ADMIN_EMAIL=you@example.com ./infra/create-admin.sh production
#
# Prompts for anything not supplied. Passwords are read without echoing and passed to the seed
# script through its environment, never on a command line.
#
# The database only admits Azure services, so this opens its firewall to this machine's public IP
# for the duration and removes the rule on exit — including on failure or Ctrl-C.
#
# Optional environment variables:
#   PG_ADMIN_PASSWORD   Postgres admin password (to build the connection string)
#   ADMIN_EMAIL         Account to create or promote
#   ADMIN_PASSWORD      Its password (at least 12 characters)
#   ADMIN_FIRST_NAME    Used only when creating (default "Admin")
#   ADMIN_LAST_NAME     Used only when creating (default "User")
set -euo pipefail
. "$(dirname "$0")/config.sh"

load_environment "${1:-}"
require_az_login

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PUBLIC_ACCESS="$(az postgres flexible-server show --resource-group "$RG" --name "$PG_SERVER" \
  --query network.publicNetworkAccess --output tsv 2>/dev/null || true)"
[ -n "$PUBLIC_ACCESS" ] || die "${PG_SERVER} not found — run ./infra/provision-environment.sh ${ENVIRONMENT} first"
[ "$PUBLIC_ACCESS" = "Enabled" ] ||
  die "${PG_SERVER} has public access ${PUBLIC_ACCESS}, so no firewall rule can be added — re-run ./infra/provision-environment.sh ${ENVIRONMENT} to repair it"

prompt_secret() { # variable-name prompt
  local value
  read -rsp "$2" value
  echo
  printf -v "$1" '%s' "$value"
}

if [ "${DRY_RUN:-0}" != "1" ]; then
  [ -t 0 ] || { [ -n "${PG_ADMIN_PASSWORD:-}" ] && [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; } ||
    die "not a terminal: set PG_ADMIN_PASSWORD, ADMIN_EMAIL and ADMIN_PASSWORD"

  [ -n "${PG_ADMIN_PASSWORD:-}" ] || prompt_secret PG_ADMIN_PASSWORD "Postgres admin password for ${PG_SERVER}: "
  if [ -z "${ADMIN_EMAIL:-}" ]; then
    read -rp "Admin email for ${ENVIRONMENT}: " ADMIN_EMAIL
  fi
  if [ -z "${ADMIN_PASSWORD:-}" ]; then
    prompt_secret ADMIN_PASSWORD "Admin password (min 12 characters): "
    prompt_secret ADMIN_PASSWORD_CONFIRM "Confirm admin password: "
    [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ] || die "passwords don't match"
  fi
  # Checked here as well as in the seed script so a short password fails before the firewall opens.
  [ "${#ADMIN_PASSWORD}" -ge 12 ] || die "admin password must be at least 12 characters"
fi

MY_IP="$(curl -sf https://api.ipify.org)" || die "couldn't determine this machine's public IP"
RULE="admin-bootstrap-$(date +%Y%m%d%H%M%S)"

close_firewall() {
  info "Removing firewall rule ${RULE}"
  run az postgres flexible-server firewall-rule delete --resource-group "$RG" \
    --server-name "$PG_SERVER" --name "$RULE" --yes --output none ||
    echo "warning: couldn't remove firewall rule ${RULE} — delete it in the portal" >&2
}

info "Opening ${PG_SERVER} to ${MY_IP} (rule ${RULE})"
run az postgres flexible-server firewall-rule create --resource-group "$RG" \
  --server-name "$PG_SERVER" --name "$RULE" \
  --start-ip-address "$MY_IP" --end-ip-address "$MY_IP" --output none
trap close_firewall EXIT

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "[dry-run] (cd api && DATABASE_URL=<${PG_SERVER}> ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx scripts/create-admin.ts)"
  exit 0
fi

# A new firewall rule can take a few seconds to apply. The seed script exits 3 only when the server
# is unreachable, so that case is retried; bad credentials or a missing table fail immediately.
DATABASE_URL="$(database_url "$PG_ADMIN_PASSWORD")"
for attempt in 1 2 3 4 5; do
  status=0
  (cd "$REPO_ROOT/api" &&
    DATABASE_URL="$DATABASE_URL" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      ADMIN_FIRST_NAME="${ADMIN_FIRST_NAME:-}" ADMIN_LAST_NAME="${ADMIN_LAST_NAME:-}" \
      npx tsx scripts/create-admin.ts) || status=$?

  if [ "$status" = "0" ]; then
    echo
    info "Done. Sign in at ${SITE_URL}/login"
    exit 0
  fi
  [ "$status" = "3" ] || die "couldn't create the admin — see the error above"
  [ "$attempt" = "5" ] && die "database still unreachable after 5 attempts"
  echo "database not reachable yet — the firewall rule may still be applying; retrying in 10s"
  sleep 10
done
