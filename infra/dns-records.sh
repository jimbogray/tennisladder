#!/usr/bin/env bash
# Prints the DNS records to add at GoDaddy for one environment, then checks whether they resolve.
# Exits non-zero until all of them do, so bind-domains.sh can use it as a gate.
#
#   ./infra/dns-records.sh staging
set -euo pipefail
. "$(dirname "$0")/config.sh"

load_environment "${1:-}"
require_az_login

SWA_HOSTNAME="$(az staticwebapp show --resource-group "$RG" --name "$SWA_NAME" \
  --query defaultHostname --output tsv 2>/dev/null || true)"
API_FQDN="$(az containerapp show --resource-group "$RG" --name "$API_APP" \
  --query properties.configuration.ingress.fqdn --output tsv 2>/dev/null || true)"
VERIFICATION_ID="$(az containerapp show --resource-group "$RG" --name "$API_APP" \
  --query properties.customDomainVerificationId --output tsv 2>/dev/null || true)"

[ -n "$SWA_HOSTNAME" ] && [ -n "$API_FQDN" ] && [ -n "$VERIFICATION_ID" ] ||
  die "${ENVIRONMENT} isn't fully provisioned yet — run ./infra/provision-environment.sh ${ENVIRONMENT}"

# GoDaddy wants names relative to the domain: "www", "api.staging", and so on.
SITE_NAME="${SITE_HOST%.${DOMAIN}}"
API_NAME="${API_HOST%.${DOMAIN}}"

cat <<EOF

DNS records for ${ENVIRONMENT} — GoDaddy → My Products → ${DOMAIN} → DNS

  Type   Name                  Value
  -----  --------------------  --------------------------------------------------
  CNAME  ${SITE_NAME}$(printf '%*s' $((20 - ${#SITE_NAME})) '')  ${SWA_HOSTNAME}
  CNAME  ${API_NAME}$(printf '%*s' $((20 - ${#API_NAME})) '')  ${API_FQDN}
  TXT    asuid.${API_NAME}$(printf '%*s' $((14 - ${#API_NAME})) '')  ${VERIFICATION_ID}

EOF

if [ "$ENVIRONMENT" = "production" ]; then
  cat <<EOF
  GoDaddy creates a default "www" CNAME on new domains — edit that record rather than adding a
  second. Then under DNS → Forwarding, forward ${DOMAIN} to ${SITE_URL}, Permanent (301),
  Forward only. GoDaddy DNS can't point the bare domain at Azure directly.

EOF
fi

# Queries a public resolver so a stale local cache doesn't give a false pass.
resolved() { dig +short "$1" "$2" @1.1.1.1 | tr -d '"' | sed 's/\.$//'; }

ALL_OK=1
check() {
  local label="$1" type="$2" name="$3" expected="$4" actual
  actual="$(resolved "$type" "$name")"
  if printf '%s\n' "$actual" | grep -Fqx "$expected"; then
    echo "  [ok]      ${label}"
  else
    echo "  [waiting] ${label} — currently: ${actual:-no answer}"
    ALL_OK=0
  fi
}

echo "Propagation check (public DNS):"
check "${SITE_HOST} → site" CNAME "$SITE_HOST" "$SWA_HOSTNAME"
check "${API_HOST} → API" CNAME "$API_HOST" "$API_FQDN"
check "asuid.${API_HOST} ownership proof" TXT "asuid.${API_HOST}" "$VERIFICATION_ID"
echo

if [ "$ALL_OK" = "1" ]; then
  info "All records resolve. Next: ./infra/bind-domains.sh ${ENVIRONMENT}"
else
  info "Not propagated yet — re-run this script to check again"
  exit 1
fi
