#!/usr/bin/env bash
# Binds an environment's custom hostnames once their DNS records resolve. Both Azure services issue
# free managed certificates as part of this. Safe to re-run.
#
#   ./infra/bind-domains.sh staging
set -euo pipefail
. "$(dirname "$0")/config.sh"

load_environment "${1:-}"
require_az_login

# Binding fails (slowly and unhelpfully) if DNS hasn't propagated, so gate on it first.
"$(dirname "$0")/dns-records.sh" "$ENVIRONMENT" >/dev/null ||
  die "DNS for ${ENVIRONMENT} doesn't resolve yet — run ./infra/dns-records.sh ${ENVIRONMENT} for details"

SITE_BOUND="$(az staticwebapp hostname list --resource-group "$RG" --name "$SWA_NAME" \
  --query "length([?name=='${SITE_HOST}'])" --output tsv 2>/dev/null || echo 0)"
if [ "$SITE_BOUND" = "0" ]; then
  info "Binding ${SITE_HOST} to ${SWA_NAME}"
  run az staticwebapp hostname set --resource-group "$RG" --name "$SWA_NAME" \
    --hostname "$SITE_HOST" --output none
else
  info "${SITE_HOST} already bound"
fi

API_BINDING="$(az containerapp hostname list --resource-group "$RG" --name "$API_APP" \
  --query "[?name=='${API_HOST}'].bindingType | [0]" --output tsv 2>/dev/null || true)"
if [ -z "$API_BINDING" ]; then
  info "Adding ${API_HOST} to ${API_APP}"
  run az containerapp hostname add --resource-group "$RG" --name "$API_APP" \
    --hostname "$API_HOST" --output none
fi
if [ "$API_BINDING" != "SniEnabled" ]; then
  info "Issuing certificate and binding ${API_HOST} (can take a few minutes)"
  run az containerapp hostname bind --resource-group "$RG" --name "$API_APP" \
    --hostname "$API_HOST" --environment "$CONTAINERAPP_ENV" --validation-method CNAME --output none
else
  info "${API_HOST} already bound with a certificate"
fi

echo
info "Bound. Check:"
echo "    curl -I ${SITE_URL}"
echo "    curl https://${API_HOST}/api/health    # the placeholder image 404s until the first deploy"
