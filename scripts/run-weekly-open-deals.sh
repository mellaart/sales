#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${SALES_APP_DIR:-/hosting/sales.troublefree.nl/apps/sales}"

export PATH="$HOME/.local/node20/bin:$HOME/.local/node/bin:$HOME/.local/bin:$HOME/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

for NODE_BIN_DIR in "$HOME"/.nvm/versions/node/*/bin; do
  if [ -d "$NODE_BIN_DIR" ]; then
    export PATH="$NODE_BIN_DIR:$PATH"
  fi
done

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  set +u
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
  set -u
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  printf '%s Node.js is niet gevonden.\n' "$(date '+%Y-%m-%d %H:%M:%S')" >&2
  exit 127
fi

cd "$APP_DIR"
exec env TZ=Europe/Amsterdam "$NODE_BIN" scripts/send-weekly-open-deals.mjs
