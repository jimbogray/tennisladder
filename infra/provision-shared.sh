#!/usr/bin/env bash
# Creates the resources shared by every environment: a resource group holding the container
# registry. Safe to re-run — existing resources are left as they are.
#
#   ./infra/provision-shared.sh            # create
#   DRY_RUN=1 ./infra/provision-shared.sh  # show what would change
set -euo pipefail
. "$(dirname "$0")/config.sh"

require_az_login

info "Resource group ${SHARED_RG}"
run az group create --name "$SHARED_RG" --location "$LOCATION" --output none

if az acr show --name "$ACR_NAME" --resource-group "$SHARED_RG" --output none 2>/dev/null; then
  info "Container registry ${ACR_NAME} already exists"
else
  available="$(az acr check-name --name "$ACR_NAME" --query nameAvailable --output tsv)"
  [ "$available" = "true" ] ||
    die "registry name '${ACR_NAME}' is taken globally — set ACR_NAME=<another name> and re-run"
  info "Creating container registry ${ACR_NAME}"
  run az acr create --name "$ACR_NAME" --resource-group "$SHARED_RG" \
    --location "$LOCATION" --sku Basic --output none
fi

info "Done. Next: ./infra/provision-environment.sh staging"
