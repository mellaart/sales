#!/usr/bin/env bash
# Shared by deployment and scheduled Node.js tasks. Fail before stopping the app.
if [ -x "$HOME/.local/node24/bin/node" ]; then
  export PATH="$HOME/.local/node24/bin:$PATH"
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
  set +u
  . "$HOME/.nvm/nvm.sh"
  nvm use 24 >/dev/null
  set -u
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] || ! "$NODE_BIN" -e '
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  process.exit(major === 24 && (minor > 22 || (minor === 22 && patch >= 3)) ? 0 : 1);
'; then
  printf '%s\n' 'Node.js 24.22.3 of nieuwer binnen 24.x is vereist.' >&2
  exit 1
fi
export PATH="$(dirname "$NODE_BIN"):$PATH"
