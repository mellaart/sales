#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${SALES_APP_DIR:-/hosting/sales.troublefree.nl/apps/sales}"
BRANCH="${SALES_BRANCH:-main}"
REMOTE="${SALES_REMOTE:-origin}"
PORT="${SALES_PORT:-3007}"
LOG_DIR="${SALES_LOG_DIR:-/hosting/sales.troublefree.nl/logs}"
DEPLOY_LOG="${SALES_DEPLOY_LOG:-$LOG_DIR/sales-deploy.log}"
APP_LOG="${SALES_APP_LOG:-$LOG_DIR/sales-next.log}"
PID_FILE="${SALES_PID_FILE:-$APP_DIR/.next-server.pid}"
DEPLOYED_FILE="${SALES_DEPLOYED_FILE:-$APP_DIR/.last-deployed-commit}"
LOCK_DIR="${SALES_DEPLOY_LOCK_DIR:-/tmp/sales-deploy.lock}"
FORCE_DEPLOY="${SALES_FORCE_DEPLOY:-0}"

if [ "${1:-}" = "--force" ]; then
  FORCE_DEPLOY="1"
fi

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

log() {
  printf "%s %s\n" "$(date "+%Y-%m-%d %H:%M:%S")" "$*"
}

mkdir -p "$LOG_DIR"
exec > >(tee -a "$DEPLOY_LOG") 2>&1

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "Deploy is al bezig."
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

on_error() {
  status=$?
  log "Deploy mislukt bij regel $1 (exit $status). Bekijk bovenstaande foutmelding."
  exit "$status"
}

trap cleanup EXIT
trap 'on_error $LINENO' ERR

cd "$APP_DIR"

CURRENT_COMMIT="$(git rev-parse HEAD)"
git fetch "$REMOTE" "$BRANCH"
REMOTE_COMMIT="$(git rev-parse "$REMOTE/$BRANCH")"
DEPLOYED_COMMIT="$(cat "$DEPLOYED_FILE" 2>/dev/null || true)"

if [ "$FORCE_DEPLOY" != "1" ] && [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ] && [ "$DEPLOYED_COMMIT" = "$REMOTE_COMMIT" ]; then
  log "Geen nieuwe versie ($CURRENT_COMMIT)."
  exit 0
fi

if [ "$FORCE_DEPLOY" = "1" ]; then
  log "Deploy geforceerd voor $CURRENT_COMMIT."
elif [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
  log "Versie staat al op de server, maar is nog niet succesvol live gezet: $CURRENT_COMMIT."
else
  log "Nieuwe versie gevonden: $CURRENT_COMMIT -> $REMOTE_COMMIT"
fi

git checkout "$BRANCH"
git pull --ff-only "$REMOTE" "$BRANCH"

NPM_BIN="$(command -v npm || true)"

if [ -z "$NPM_BIN" ]; then
  log "npm niet gevonden. PATH=$PATH"
  exit 127
fi

NPM_REAL="$NPM_BIN"
if command -v readlink >/dev/null 2>&1; then
  NPM_REAL="$(readlink -f "$NPM_BIN" 2>/dev/null || printf "%s" "$NPM_BIN")"
fi

NPM_DIR="$(dirname "$NPM_REAL")"
if [ -x "$NPM_DIR/node" ]; then
  export PATH="$NPM_DIR:$PATH"
  NODE_BIN="$NPM_DIR/node"
else
  NODE_BIN="$(command -v node || true)"
fi

if [ -z "$NODE_BIN" ]; then
  log "node niet gevonden. PATH=$PATH"
  exit 127
fi

log "Node: $("$NODE_BIN" -v 2>/dev/null || echo onbekend) ($NODE_BIN)"
log "NPM: $(env PATH="$NPM_DIR:$PATH" "$NPM_BIN" -v 2>/dev/null || echo onbekend) ($NPM_BIN)"

env PATH="$NPM_DIR:$PATH" "$NPM_BIN" install --no-package-lock
env PATH="$NPM_DIR:$PATH" "$NPM_BIN" run build

stop_app() {
  if [ -f "$PID_FILE" ]; then
    PID="$(cat "$PID_FILE" 2>/dev/null || true)"

    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      log "Stop bestaande app via pid file: $PID"
      kill "$PID" 2>/dev/null || true

      for _ in 1 2 3 4 5 6 7 8 9 10; do
        if ! kill -0 "$PID" 2>/dev/null; then
          break
        fi
        sleep 1
      done

      if kill -0 "$PID" 2>/dev/null; then
        log "Forceer stop app: $PID"
        kill -9 "$PID" 2>/dev/null || true
      fi
    fi
  fi

  PORT_PIDS="$(
    ss -ltnp 2>/dev/null \
      | awk -v port=":$PORT" '$4 ~ port { print }' \
      | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
      | sort -u || true
  )"

  if [ -n "$PORT_PIDS" ]; then
    for PID in $PORT_PIDS; do
      log "Stop proces op poort $PORT: $PID"
      kill "$PID" 2>/dev/null || true
    done
    sleep 2
  fi
}

start_app() {
  log "Start app op poort $PORT"
  nohup env PORT="$PORT" PATH="$NPM_DIR:$PATH" "$NPM_BIN" run start > "$APP_LOG" 2>&1 &
  echo "$!" > "$PID_FILE"
  sleep 3

  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -z "$PID" ] || ! kill -0 "$PID" 2>/dev/null; then
    log "Start mislukt. Bekijk $APP_LOG"
    exit 1
  fi

  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "http://127.0.0.1:$PORT" >/dev/null; then
      git rev-parse HEAD > "$DEPLOYED_FILE"
      log "Deploy klaar: $(git rev-parse --short HEAD)"
      exit 0
    fi

    log "App gestart, maar healthcheck geeft geen OK. Bekijk $APP_LOG"
    exit 1
  fi

  git rev-parse HEAD > "$DEPLOYED_FILE"
  log "Deploy klaar: $(git rev-parse --short HEAD)"
}

stop_app
start_app
