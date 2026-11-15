#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${SALES_APP_DIR:-/hosting/sales.troublefree.nl/apps/sales}"


# shellcheck source=scripts/use-node24.sh
. "$APP_DIR/scripts/use-node24.sh"

cd "$APP_DIR"
exec env TZ=Europe/Amsterdam "$NODE_BIN" scripts/send-weekly-open-deals.mjs
